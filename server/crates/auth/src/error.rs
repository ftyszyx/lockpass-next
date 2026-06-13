use thiserror::Error;

pub type AuthResult<T> = Result<T, AuthError>;

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("valid email is required")]
    InvalidEmail,
    #[error("password must be at least {minimum_length} characters")]
    WeakPassword { minimum_length: usize },
    #[error("registration is disabled")]
    RegistrationDisabled,
    #[error("identity already exists")]
    DuplicateIdentity,
    #[error("invalid credentials")]
    InvalidCredentials,
    #[error("account is disabled")]
    AccountDisabled,
    #[error("password credential is missing")]
    MissingPasswordCredential,
    #[error("password does not match")]
    PasswordMismatch,
    #[error("password hash failed: {0}")]
    PasswordHash(String),
    #[error("auth store failed: {0}")]
    Store(String),
}
