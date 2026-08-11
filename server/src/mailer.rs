use lettre::{
    message::{header::ContentType, Mailbox, MultiPart, SinglePart},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use std::time::Duration;
use tracing::{info, warn};

use crate::{
    email_template::{render_verification_code, EmailTemplateVariables, RenderedEmail},
    error::{AppError, AppResult},
    model::{EmailServiceConfig, EmailServiceMode},
};

#[derive(Clone, Default)]
pub struct Mailer;

const SMTP_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SmtpSecurity {
    ImplicitTls,
    StartTls,
}

impl Mailer {
    pub async fn test_connection(&self, config: &EmailServiceConfig) -> AppResult<()> {
        ensure_smtp_mode(config)?;
        let connected = smtp_transport(config)?
            .test_connection()
            .await
            .map_err(|error| {
                smtp_service_error(
                    "smtp_connection_failed",
                    "SMTP connection test failed",
                    config,
                    error,
                )
            })?;
        if !connected {
            return Err(AppError::BadGatewayCode {
                code: "smtp_connection_failed",
                message: "SMTP server rejected the connection test".to_string(),
            });
        }
        Ok(())
    }

    pub async fn send_email_code(
        &self,
        config: &EmailServiceConfig,
        email: &str,
        display_name: Option<&str>,
        code: &str,
        expires_minutes: i64,
        locale: Option<&str>,
    ) -> AppResult<()> {
        let rendered = render_verification_code(
            config,
            locale,
            EmailTemplateVariables {
                display_name,
                email,
                code,
                expires_minutes,
            },
        )?;
        self.send_rendered_email(config, email, rendered).await
    }

    pub async fn send_rendered_email(
        &self,
        config: &EmailServiceConfig,
        recipient: &str,
        rendered: RenderedEmail,
    ) -> AppResult<()> {
        match config.mode {
            EmailServiceMode::Log => {
                info!(
                    target: "lockpass_sync_server::mailer",
                    recipient,
                    from = config.from,
                    subject = rendered.subject,
                    "development email"
                );
                Ok(())
            }
            EmailServiceMode::Smtp => {
                let from = parse_mailbox(&config.from, "email.from")?;
                let to = parse_mailbox(recipient, "recipient")?;
                let message = Message::builder()
                    .from(from)
                    .to(to)
                    .subject(rendered.subject)
                    .multipart(
                        MultiPart::alternative()
                            .singlepart(
                                SinglePart::builder()
                                    .header(ContentType::TEXT_PLAIN)
                                    .body(rendered.text),
                            )
                            .singlepart(
                                SinglePart::builder()
                                    .header(ContentType::TEXT_HTML)
                                    .body(rendered.html),
                            ),
                    )
                    .map_err(|error| {
                        AppError::Internal(format!("failed to build email message: {error}"))
                    })?;

                smtp_transport(config)?
                    .send(message)
                    .await
                    .map_err(|error| {
                        smtp_service_error(
                            "smtp_send_failed",
                            "Failed to send email",
                            config,
                            error,
                        )
                    })?;
                Ok(())
            }
        }
    }
}

fn ensure_smtp_mode(config: &EmailServiceConfig) -> AppResult<()> {
    if matches!(config.mode, EmailServiceMode::Smtp) {
        Ok(())
    } else {
        Err(AppError::BadRequest(
            "SMTP delivery must be enabled for this operation".to_string(),
        ))
    }
}

fn smtp_transport(config: &EmailServiceConfig) -> AppResult<AsyncSmtpTransport<Tokio1Executor>> {
    let host = config
        .smtp_host
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("SMTP host is required".to_string()))?;
    let username = config
        .smtp_username
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("SMTP username is required".to_string()))?;
    let password = config
        .smtp_password
        .as_deref()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("SMTP password is required".to_string()))?;

    let credentials = Credentials::new(username.to_string(), password.to_string());
    let builder = match smtp_security(config.smtp_port) {
        SmtpSecurity::ImplicitTls => AsyncSmtpTransport::<Tokio1Executor>::relay(host),
        SmtpSecurity::StartTls => AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host),
    }
    .map_err(|error| AppError::Internal(format!("invalid SMTP host configuration: {error}")))?;
    Ok(builder
        .port(config.smtp_port)
        .credentials(credentials)
        .timeout(Some(SMTP_TIMEOUT))
        .build())
}

fn smtp_security(port: u16) -> SmtpSecurity {
    if port == 465 {
        SmtpSecurity::ImplicitTls
    } else {
        SmtpSecurity::StartTls
    }
}

fn smtp_service_error(
    code: &'static str,
    action: &str,
    config: &EmailServiceConfig,
    error: lettre::transport::smtp::Error,
) -> AppError {
    warn!(
        smtp_host = config.smtp_host.as_deref().unwrap_or_default(),
        smtp_port = config.smtp_port,
        error = %error,
        "{action}"
    );
    AppError::BadGatewayCode {
        code,
        message: format!("{action}: {error}"),
    }
}

fn parse_mailbox(value: &str, field: &str) -> AppResult<Mailbox> {
    value.parse::<Mailbox>().map_err(|error| {
        AppError::BadRequest(format!("{field} is not a valid email address: {error}"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selects_implicit_tls_for_smtps_port() {
        assert_eq!(smtp_security(465), SmtpSecurity::ImplicitTls);
    }

    #[test]
    fn selects_starttls_for_submission_port() {
        assert_eq!(smtp_security(587), SmtpSecurity::StartTls);
    }
}
