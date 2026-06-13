mod email;
mod error;
mod password;
mod provider;
mod secret;

pub use email::{
    EmailAuthSession, EmailAuthStore, EmailIdentity, EmailLoginInput, EmailPasswordProvider,
    EmailRegisterInput, NewEmailAccount, StoredEmailAccount,
};
pub use error::{AuthError, AuthResult};
pub use password::{Argon2PasswordHasher, PasswordHasher, PasswordPolicy};
pub use provider::{AuthProvider, AuthProviderKind, NormalizedIdentity};
pub use secret::{
    SecretIssuer, SecretMaterial, APPROVAL_CODE_PREFIX, DEVICE_TOKEN_PREFIX, SESSION_TOKEN_PREFIX,
    STATE_TOKEN_PREFIX,
};

#[derive(Clone, Debug, Default)]
pub struct AuthServices {
    email: EmailPasswordProvider,
    passwords: Argon2PasswordHasher,
    secrets: SecretIssuer,
}

impl AuthServices {
    pub fn email(&self) -> &EmailPasswordProvider {
        &self.email
    }

    pub fn passwords(&self) -> &Argon2PasswordHasher {
        &self.passwords
    }

    pub fn secrets(&self) -> &SecretIssuer {
        &self.secrets
    }
}
