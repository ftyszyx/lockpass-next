use crate::AuthResult;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AuthProviderKind {
    Email,
    Sms,
    Google,
    WeChat,
    Custom(String),
}

impl AuthProviderKind {
    pub fn as_str(&self) -> &str {
        match self {
            AuthProviderKind::Email => "email",
            AuthProviderKind::Sms => "sms",
            AuthProviderKind::Google => "google",
            AuthProviderKind::WeChat => "wechat",
            AuthProviderKind::Custom(value) => value.as_str(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NormalizedIdentity {
    provider: AuthProviderKind,
    subject: String,
    display_label: String,
}

impl NormalizedIdentity {
    pub fn new(provider: AuthProviderKind, subject: String, display_label: String) -> Self {
        Self {
            provider,
            subject,
            display_label,
        }
    }

    pub fn provider(&self) -> &AuthProviderKind {
        &self.provider
    }

    pub fn provider_code(&self) -> &str {
        self.provider.as_str()
    }

    pub fn subject(&self) -> &str {
        &self.subject
    }

    pub fn display_label(&self) -> &str {
        &self.display_label
    }
}

pub trait AuthProvider {
    fn provider(&self) -> AuthProviderKind;
    fn normalize_subject(&self, raw_subject: &str) -> AuthResult<NormalizedIdentity>;
}
