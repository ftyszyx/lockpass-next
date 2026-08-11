use std::collections::BTreeSet;

use chrono::Utc;

use crate::{
    error::{AppError, AppResult},
    model::{
        EmailServiceConfig, EmailTemplateDetailView, EmailTemplateOverride,
        EmailTemplatePreviewResponse, EmailTemplateSummaryView,
    },
};

pub const VERIFICATION_CODE_EVENT: &str = "verificationCode";
pub const DEFAULT_TEMPLATE_ID: &str = "verification-code.en-US";
const ZH_TEMPLATE_ID: &str = "verification-code.zh-CN";
const MAX_SUBJECT_CHARS: usize = 200;
const MAX_HTML_BYTES: usize = 100_000;
const PLACEHOLDERS: [&str; 5] = [
    "productName",
    "displayName",
    "email",
    "code",
    "expiresMinutes",
];

#[derive(Clone, Debug)]
pub struct RenderedEmail {
    pub subject: String,
    pub html: String,
    pub text: String,
}

pub struct EmailTemplateVariables<'a> {
    pub display_name: Option<&'a str>,
    pub email: &'a str,
    pub code: &'a str,
    pub expires_minutes: i64,
}

struct BuiltInTemplate {
    id: &'static str,
    locale: &'static str,
    name: &'static str,
    subject: &'static str,
    html: &'static str,
}

const BUILT_IN_TEMPLATES: [BuiltInTemplate; 2] = [
    BuiltInTemplate {
        id: ZH_TEMPLATE_ID,
        locale: "zh-CN",
        name: "邮箱验证码",
        subject: "{{productName}} 邮箱验证码",
        html: r#"<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:24px;background:#f6f8f9;font-family:Arial,'Microsoft YaHei',sans-serif;color:#17212b;">
    <div style="max-width:600px;margin:0 auto;overflow:hidden;border:1px solid #dbe3e7;border-radius:8px;background:#ffffff;">
      <div style="padding:24px 28px;background:#0f766e;color:#ffffff;"><h1 style="margin:0;font-size:22px;">邮箱验证码</h1></div>
      <div style="padding:28px;line-height:1.7;">
        <p style="margin:0 0 16px;">{{displayName}}，您好：</p>
        <p style="margin:0 0 18px;">您的验证码是：</p>
        <p style="margin:0 0 18px;font-size:30px;font-weight:700;letter-spacing:6px;">{{code}}</p>
        <p style="margin:0;color:#52616b;">验证码将在 {{expiresMinutes}} 分钟后失效。如果不是您本人操作，请忽略此邮件。</p>
      </div>
      <div style="padding:16px 28px;background:#f8fafb;color:#71808a;font-size:12px;">此邮件由 {{productName}} 自动发送，请勿直接回复。</div>
    </div>
  </body>
</html>"#,
    },
    BuiltInTemplate {
        id: DEFAULT_TEMPLATE_ID,
        locale: "en-US",
        name: "Email verification code",
        subject: "Your {{productName}} verification code",
        html: r#"<!doctype html>
<html lang="en-US">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:24px;background:#f6f8f9;font-family:Arial,sans-serif;color:#17212b;">
    <div style="max-width:600px;margin:0 auto;overflow:hidden;border:1px solid #dbe3e7;border-radius:8px;background:#ffffff;">
      <div style="padding:24px 28px;background:#0f766e;color:#ffffff;"><h1 style="margin:0;font-size:22px;">Email verification code</h1></div>
      <div style="padding:28px;line-height:1.7;">
        <p style="margin:0 0 16px;">Hi {{displayName}},</p>
        <p style="margin:0 0 18px;">Your verification code is:</p>
        <p style="margin:0 0 18px;font-size:30px;font-weight:700;letter-spacing:6px;">{{code}}</p>
        <p style="margin:0;color:#52616b;">This code expires in {{expiresMinutes}} minutes. If you did not request it, you can ignore this email.</p>
      </div>
      <div style="padding:16px 28px;background:#f8fafb;color:#71808a;font-size:12px;">This email was sent automatically by {{productName}}. Please do not reply.</div>
    </div>
  </body>
</html>"#,
    },
];

pub fn list_templates(config: &EmailServiceConfig) -> Vec<EmailTemplateSummaryView> {
    BUILT_IN_TEMPLATES
        .iter()
        .map(|template| {
            let custom = config.templates.get(template.id);
            EmailTemplateSummaryView {
                id: template.id.to_string(),
                event: VERIFICATION_CODE_EVENT.to_string(),
                locale: template.locale.to_string(),
                name: template.name.to_string(),
                subject: custom
                    .map(|value| value.subject.clone())
                    .unwrap_or_else(|| template.subject.to_string()),
                is_custom: custom.is_some(),
                updated_at: custom.map(|value| value.updated_at),
            }
        })
        .collect()
}

pub fn get_template(
    config: &EmailServiceConfig,
    template_id: &str,
) -> AppResult<EmailTemplateDetailView> {
    let built_in = built_in_template(template_id)?;
    let custom = config.templates.get(built_in.id);
    Ok(EmailTemplateDetailView {
        id: built_in.id.to_string(),
        event: VERIFICATION_CODE_EVENT.to_string(),
        locale: built_in.locale.to_string(),
        name: built_in.name.to_string(),
        subject: custom
            .map(|value| value.subject.clone())
            .unwrap_or_else(|| built_in.subject.to_string()),
        html: custom
            .map(|value| value.html.clone())
            .unwrap_or_else(|| built_in.html.to_string()),
        is_custom: custom.is_some(),
        updated_at: custom.map(|value| value.updated_at),
        placeholders: PLACEHOLDERS
            .iter()
            .map(|value| format!("{{{{{value}}}}}"))
            .collect(),
    })
}

pub fn update_template(
    config: &mut EmailServiceConfig,
    template_id: &str,
    subject: String,
    html: String,
) -> AppResult<EmailTemplateDetailView> {
    let template_id = built_in_template(template_id)?.id;
    validate_template(&subject, &html)?;
    config.templates.insert(
        template_id.to_string(),
        EmailTemplateOverride {
            subject: subject.trim().to_string(),
            html,
            updated_at: Utc::now(),
        },
    );
    get_template(config, template_id)
}

pub fn restore_template(
    config: &mut EmailServiceConfig,
    template_id: &str,
) -> AppResult<EmailTemplateDetailView> {
    let template_id = built_in_template(template_id)?.id;
    config.templates.remove(template_id);
    get_template(config, template_id)
}

pub fn preview_template(
    template_id: &str,
    subject: &str,
    html: &str,
) -> AppResult<EmailTemplatePreviewResponse> {
    let template = built_in_template(template_id)?;
    let variables = EmailTemplateVariables {
        display_name: Some(if template.locale == "zh-CN" {
            "示例用户"
        } else {
            "Example user"
        }),
        email: "user@example.com",
        code: "123456",
        expires_minutes: 10,
    };
    let rendered = render(template.locale, subject, html, variables)?;
    Ok(EmailTemplatePreviewResponse {
        subject: rendered.subject,
        html: rendered.html,
    })
}

pub fn render_by_id(
    config: &EmailServiceConfig,
    template_id: &str,
    variables: EmailTemplateVariables<'_>,
) -> AppResult<RenderedEmail> {
    let template = get_template(config, template_id)?;
    render(
        &template.locale,
        &template.subject,
        &template.html,
        variables,
    )
}

pub fn render_verification_code(
    config: &EmailServiceConfig,
    locale: Option<&str>,
    variables: EmailTemplateVariables<'_>,
) -> AppResult<RenderedEmail> {
    render_by_id(config, template_id_for_locale(locale), variables)
}

fn render(
    locale: &str,
    subject: &str,
    html: &str,
    variables: EmailTemplateVariables<'_>,
) -> AppResult<RenderedEmail> {
    validate_template(subject, html)?;
    let display_name = variables
        .display_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(if locale == "zh-CN" {
            "LockPass 用户"
        } else {
            "LockPass user"
        });
    let values = [
        ("productName", "LockPass".to_string()),
        ("displayName", display_name.to_string()),
        ("email", variables.email.to_string()),
        ("code", variables.code.to_string()),
        ("expiresMinutes", variables.expires_minutes.to_string()),
    ];
    let subject = sanitize_subject(render_template_string(subject, &values, false)?);
    let html = render_template_string(html, &values, true)?;
    let text = if locale == "zh-CN" {
        format!(
            "{display_name}，您好：\n\n您的 LockPass 验证码是：{}\n\n验证码将在 {} 分钟后失效。",
            variables.code, variables.expires_minutes
        )
    } else {
        format!(
            "Hi {display_name},\n\nYour LockPass verification code is: {}\n\nThis code expires in {} minutes.",
            variables.code, variables.expires_minutes
        )
    };
    Ok(RenderedEmail {
        subject,
        html,
        text,
    })
}

fn validate_template(subject: &str, html: &str) -> AppResult<()> {
    if subject.trim().is_empty() {
        return Err(AppError::BadRequest(
            "email template subject is required".to_string(),
        ));
    }
    if subject.chars().count() > MAX_SUBJECT_CHARS {
        return Err(AppError::BadRequest(format!(
            "email template subject cannot exceed {MAX_SUBJECT_CHARS} characters"
        )));
    }
    if html.trim().is_empty() {
        return Err(AppError::BadRequest(
            "email template HTML is required".to_string(),
        ));
    }
    if html.len() > MAX_HTML_BYTES {
        return Err(AppError::BadRequest(format!(
            "email template HTML cannot exceed {MAX_HTML_BYTES} bytes"
        )));
    }
    let lower_html = html.to_ascii_lowercase();
    for blocked in [
        "<script",
        "javascript:",
        "<iframe",
        "<object",
        "<embed",
        "<form",
    ] {
        if lower_html.contains(blocked) {
            return Err(AppError::BadRequest(format!(
                "email template contains blocked content: {blocked}"
            )));
        }
    }
    validate_placeholders(subject)?;
    validate_placeholders(html)
}

fn validate_placeholders(value: &str) -> AppResult<()> {
    let allowed = PLACEHOLDERS.into_iter().collect::<BTreeSet<_>>();
    let mut remaining = value;
    while let Some(start) = remaining.find("{{") {
        remaining = &remaining[start + 2..];
        let Some(end) = remaining.find("}}") else {
            return Err(AppError::BadRequest(
                "email template contains an incomplete placeholder".to_string(),
            ));
        };
        let name = remaining[..end].trim();
        if !allowed.contains(name) {
            return Err(AppError::BadRequest(format!(
                "unsupported email template placeholder: {{{{{name}}}}}"
            )));
        }
        remaining = &remaining[end + 2..];
    }
    Ok(())
}

fn render_template_string(
    value: &str,
    variables: &[(&str, String)],
    escape_html_values: bool,
) -> AppResult<String> {
    let mut output = String::with_capacity(value.len());
    let mut remaining = value;
    while let Some(start) = remaining.find("{{") {
        output.push_str(&remaining[..start]);
        remaining = &remaining[start + 2..];
        let end = remaining.find("}}").ok_or_else(|| {
            AppError::BadRequest("email template contains an incomplete placeholder".to_string())
        })?;
        let name = remaining[..end].trim();
        let replacement = variables
            .iter()
            .find(|(key, _)| *key == name)
            .map(|(_, value)| value.as_str())
            .unwrap_or_default();
        if escape_html_values {
            output.push_str(&html_escape(replacement));
        } else {
            output.push_str(replacement);
        }
        remaining = &remaining[end + 2..];
    }
    output.push_str(remaining);
    Ok(output)
}

fn template_id_for_locale(locale: Option<&str>) -> &'static str {
    if locale
        .map(str::trim)
        .unwrap_or_default()
        .to_ascii_lowercase()
        .starts_with("zh")
    {
        ZH_TEMPLATE_ID
    } else {
        DEFAULT_TEMPLATE_ID
    }
}

fn built_in_template(template_id: &str) -> AppResult<&'static BuiltInTemplate> {
    BUILT_IN_TEMPLATES
        .iter()
        .find(|template| template.id == template_id.trim())
        .ok_or_else(|| AppError::NotFound("email template not found".to_string()))
}

fn sanitize_subject(value: String) -> String {
    value.replace(['\r', '\n'], " ").trim().to_string()
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
mod tests;
