use lettre::{
    message::{header::ContentType, Mailbox, MultiPart, SinglePart},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use tracing::info;

use crate::{
    error::{AppError, AppResult},
    model::{EmailServiceConfig, EmailServiceMode},
};

#[derive(Clone, Default)]
pub struct Mailer;

impl Mailer {
    pub async fn send_email_code(
        &self,
        config: &EmailServiceConfig,
        email: &str,
        display_name: Option<&str>,
        code: &str,
        expires_minutes: i64,
    ) -> AppResult<()> {
        match config.mode {
            EmailServiceMode::Log => {
                info!(
                    target: "lockpass_sync_server::mailer",
                    email,
                    from = config.from,
                    code,
                    expires_minutes,
                    "development email verification code"
                );
                Ok(())
            }
            EmailServiceMode::Smtp => {
                let from = parse_mailbox(&config.from, "email.from")?;
                let transport = smtp_transport(config)?;
                let to = parse_mailbox(email, "email")?;
                let subject = "Your LockPass verification code";
                let text = email_code_text(display_name, code, expires_minutes);
                let html = email_code_html(display_name, code, expires_minutes);
                let message = Message::builder()
                    .from(from.clone())
                    .to(to)
                    .subject(subject)
                    .multipart(
                        MultiPart::alternative()
                            .singlepart(
                                SinglePart::builder()
                                    .header(ContentType::TEXT_PLAIN)
                                    .body(text),
                            )
                            .singlepart(
                                SinglePart::builder()
                                    .header(ContentType::TEXT_HTML)
                                    .body(html),
                            ),
                    )
                    .map_err(|error| {
                        AppError::Internal(format!("failed to build email message: {error}"))
                    })?;

                transport.send(message).await.map_err(|error| {
                    AppError::Internal(format!("failed to send email code: {error}"))
                })?;
                Ok(())
            }
        }
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
    AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host)
        .map_err(|error| AppError::Internal(format!("invalid SMTP host configuration: {error}")))
        .map(|builder| {
            builder
                .port(config.smtp_port)
                .credentials(credentials)
                .build()
        })
}

fn parse_mailbox(value: &str, field: &str) -> AppResult<Mailbox> {
    value.parse::<Mailbox>().map_err(|error| {
        AppError::BadRequest(format!("{field} is not a valid email address: {error}"))
    })
}

fn email_code_text(display_name: Option<&str>, code: &str, expires_minutes: i64) -> String {
    let greeting = display_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("Hi {value},"))
        .unwrap_or_else(|| "Hi,".to_string());
    format!(
        "{greeting}\n\nYour LockPass verification code is:\n\n{code}\n\nThis code expires in {expires_minutes} minutes. If you did not request this code, you can ignore this email.\n\nLockPass"
    )
}

fn email_code_html(display_name: Option<&str>, code: &str, expires_minutes: i64) -> String {
    let greeting = display_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("Hi {},", html_escape(value)))
        .unwrap_or_else(|| "Hi,".to_string());
    format!(
        r#"<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
    <p>{greeting}</p>
    <p>Your LockPass verification code is:</p>
    <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">{code}</p>
    <p>This code expires in {expires_minutes} minutes. If you did not request this code, you can ignore this email.</p>
    <p>LockPass</p>
  </body>
</html>"#
    )
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
