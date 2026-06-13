use sha2::{Digest, Sha256};
use uuid::Uuid;

pub const SESSION_TOKEN_PREFIX: &str = "lp_sess";
pub const DEVICE_TOKEN_PREFIX: &str = "lp_dev";
pub const STATE_TOKEN_PREFIX: &str = "state";
pub const APPROVAL_CODE_PREFIX: &str = "lp_code";

#[derive(Clone, Debug, Default)]
pub struct SecretIssuer;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SecretMaterial {
    value: String,
    hash: String,
}

impl SecretMaterial {
    pub fn new(value: String, hash: String) -> Self {
        Self { value, hash }
    }

    pub fn value(&self) -> &str {
        &self.value
    }

    pub fn hash(&self) -> &str {
        &self.hash
    }

    pub fn into_value(self) -> String {
        self.value
    }
}

impl SecretIssuer {
    pub fn issue(&self, prefix: &str) -> SecretMaterial {
        let value = format!(
            "{prefix}_{}_{}",
            Uuid::new_v4().simple(),
            Uuid::new_v4().simple()
        );
        SecretMaterial::new(value.clone(), self.hash(&value))
    }

    pub fn hash(&self, value: &str) -> String {
        let digest = Sha256::digest(value.as_bytes());
        hex::encode(digest)
    }

    pub fn user_code(&self) -> String {
        let raw = Uuid::new_v4().simple().to_string();
        format!("{}-{}", &raw[0..4], &raw[4..8]).to_uppercase()
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        AuthProvider, AuthServices, PasswordHasher, DEVICE_TOKEN_PREFIX, SESSION_TOKEN_PREFIX,
    };

    #[test]
    fn email_provider_normalizes_subjects() {
        let auth = AuthServices::default();
        let identity = auth
            .email()
            .normalize_subject("  USER@Example.COM ")
            .expect("email should be valid");

        assert_eq!(identity.provider_code(), "email");
        assert_eq!(identity.subject(), "user@example.com");
    }

    #[test]
    fn password_hash_roundtrip() {
        let auth = AuthServices::default();
        let hash = auth
            .passwords()
            .hash("Password123!")
            .expect("hash should work");

        auth.passwords()
            .verify(&hash, "Password123!")
            .expect("password should match");
        assert!(auth.passwords().verify(&hash, "wrong-password").is_err());
    }

    #[test]
    fn issued_tokens_include_prefix_and_hash() {
        let auth = AuthServices::default();
        let session = auth.secrets().issue(SESSION_TOKEN_PREFIX);
        let device = auth.secrets().issue(DEVICE_TOKEN_PREFIX);

        assert!(session.value().starts_with("lp_sess_"));
        assert!(device.value().starts_with("lp_dev_"));
        assert_eq!(session.hash(), auth.secrets().hash(session.value()));
        assert_ne!(session.value(), device.value());
    }
}
