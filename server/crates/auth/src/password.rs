use argon2::{password_hash::SaltString, Argon2, PasswordHash, PasswordVerifier};
use rand_core::OsRng;

use crate::{AuthError, AuthResult};

#[derive(Clone, Debug)]
pub struct PasswordPolicy {
    minimum_length: usize,
}

impl Default for PasswordPolicy {
    fn default() -> Self {
        Self { minimum_length: 8 }
    }
}

impl PasswordPolicy {
    pub fn validate(&self, password: &str) -> AuthResult<()> {
        if password.len() < self.minimum_length {
            return Err(AuthError::WeakPassword {
                minimum_length: self.minimum_length,
            });
        }
        Ok(())
    }
}

pub trait PasswordHasher {
    fn hash(&self, password: &str) -> AuthResult<String>;
    fn verify(&self, hash: &str, password: &str) -> AuthResult<()>;
}

#[derive(Clone, Debug, Default)]
pub struct Argon2PasswordHasher {
    policy: PasswordPolicy,
}

impl Argon2PasswordHasher {
    pub fn policy(&self) -> &PasswordPolicy {
        &self.policy
    }
}

impl PasswordHasher for Argon2PasswordHasher {
    fn hash(&self, password: &str) -> AuthResult<String> {
        self.policy.validate(password)?;
        let salt = SaltString::generate(&mut OsRng);
        let password_hash = argon2::PasswordHasher::hash_password(
            &Argon2::default(),
            password.as_bytes(),
            &salt,
        )
        .map_err(|error| AuthError::PasswordHash(error.to_string()))?;

        Ok(password_hash.to_string())
    }

    fn verify(&self, hash: &str, password: &str) -> AuthResult<()> {
        let parsed_hash =
            PasswordHash::new(hash).map_err(|_| AuthError::PasswordMismatch)?;
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .map_err(|_| AuthError::PasswordMismatch)
    }
}
