use super::*;

#[test]
fn renders_localized_verification_template_and_escapes_values() {
    let config = EmailServiceConfig::default();
    let rendered = render_verification_code(
        &config,
        Some("zh-CN"),
        EmailTemplateVariables {
            display_name: Some("<Admin>"),
            email: "admin@example.com",
            code: "123456",
            expires_minutes: 10,
        },
    )
    .expect("template should render");

    assert_eq!(rendered.subject, "LockPass 邮箱验证码");
    assert!(rendered.html.contains("&lt;Admin&gt;"));
    assert!(!rendered.html.contains("<Admin>"));
    assert!(rendered.text.contains("123456"));
}

#[test]
fn rejects_unsupported_placeholders_and_active_content() {
    assert!(preview_template(DEFAULT_TEMPLATE_ID, "{{unknown}}", "<p>hello</p>").is_err());
    assert!(preview_template(
        DEFAULT_TEMPLATE_ID,
        "Valid subject",
        "<script>alert(1)</script>"
    )
    .is_err());
}

#[test]
fn custom_template_can_be_restored() {
    let mut config = EmailServiceConfig::default();
    update_template(
        &mut config,
        DEFAULT_TEMPLATE_ID,
        "Custom {{code}}".to_string(),
        "<p>{{code}}</p>".to_string(),
    )
    .expect("custom template should save");
    assert!(
        get_template(&config, DEFAULT_TEMPLATE_ID)
            .expect("template should exist")
            .is_custom
    );

    let restored =
        restore_template(&mut config, DEFAULT_TEMPLATE_ID).expect("template should restore");
    assert!(!restored.is_custom);
}
