use crate::{
    provider::{AuthProvider, AuthProviderKind, NormalizedIdentity},
    AuthError, AuthResult, PasswordHasher, SecretIssuer, SESSION_TOKEN_PREFIX,
};

#[derive(Clone, Debug, Default)]
pub struct EmailPasswordProvider;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EmailIdentity {
    normalized: NormalizedIdentity,
}

impl EmailIdentity {
    pub fn provider_code(&self) -> &str {
        self.normalized.provider_code()
    }

    pub fn subject(&self) -> &str {
        self.normalized.subject()
    }

    pub fn display_label(&self) -> &str {
        self.normalized.display_label()
    }

    pub fn into_subject(self) -> String {
        self.normalized.subject().to_string()
    }
}

impl EmailPasswordProvider {
    pub fn normalize_email(&self, email: &str) -> AuthResult<EmailIdentity> {
        Ok(EmailIdentity {
            normalized: self.normalize_subject(email)?,
        })
    }

    pub fn register<S, H>(
        &self,
        store: &mut S,
        passwords: &H,
        secrets: &SecretIssuer,
        input: EmailRegisterInput,
    ) -> AuthResult<EmailAuthSession<S::Account>>
    where
        S: EmailAuthStore,
        H: PasswordHasher,
    {
        let identity = self.normalize_email(&input.email)?;
        if !store
            .registration_enabled()
            .map_err(|error| AuthError::Store(error.to_string()))?
        {
            return Err(AuthError::RegistrationDisabled);
        }
        if store
            .email_identity_exists(identity.provider_code(), identity.subject())
            .map_err(|error| AuthError::Store(error.to_string()))?
        {
            return Err(AuthError::DuplicateIdentity);
        }

        let password_hash = passwords.hash(&input.password)?;
        let display_name = input
            .display_name
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| identity.display_label().to_string());
        let account = store
            .create_email_account(NewEmailAccount {
                provider: identity.provider_code().to_string(),
                subject: identity.subject().to_string(),
                display_label: identity.display_label().to_string(),
                display_name,
                password_hash,
            })
            .map_err(|error| AuthError::Store(error.to_string()))?;

        self.issue_session(store, secrets, account)
    }

    pub fn login<S, H>(
        &self,
        store: &mut S,
        passwords: &H,
        secrets: &SecretIssuer,
        input: EmailLoginInput,
    ) -> AuthResult<EmailAuthSession<S::Account>>
    where
        S: EmailAuthStore,
        H: PasswordHasher,
    {
        let identity = self.normalize_email(&input.email)?;
        let stored = store
            .find_email_account(identity.provider_code(), identity.subject())
            .map_err(|error| AuthError::Store(error.to_string()))?
            .ok_or(AuthError::InvalidCredentials)?;

        if stored.disabled {
            return Err(AuthError::AccountDisabled);
        }

        let password_hash = stored
            .password_hash
            .as_deref()
            .ok_or(AuthError::MissingPasswordCredential)?;
        passwords
            .verify(password_hash, &input.password)
            .map_err(|_| AuthError::InvalidCredentials)?;

        self.issue_session(store, secrets, stored.account)
    }

    fn issue_session<S>(
        &self,
        store: &mut S,
        secrets: &SecretIssuer,
        account: S::Account,
    ) -> AuthResult<EmailAuthSession<S::Account>>
    where
        S: EmailAuthStore,
    {
        let token = secrets.issue(SESSION_TOKEN_PREFIX);
        store
            .create_session(&account, token.hash())
            .map_err(|error| AuthError::Store(error.to_string()))?;

        Ok(EmailAuthSession {
            account,
            token: token.into_value(),
            token_type: "Bearer".to_string(),
        })
    }
}

impl AuthProvider for EmailPasswordProvider {
    fn provider(&self) -> AuthProviderKind {
        AuthProviderKind::Email
    }

    fn normalize_subject(&self, raw_subject: &str) -> AuthResult<NormalizedIdentity> {
        let email = raw_subject.trim().to_lowercase();
        let (local, domain) = email.split_once('@').ok_or(AuthError::InvalidEmail)?;
        if local.is_empty() || domain.is_empty() || domain.contains('@') {
            return Err(AuthError::InvalidEmail);
        }

        Ok(NormalizedIdentity::new(
            AuthProviderKind::Email,
            email.clone(),
            email,
        ))
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EmailRegisterInput {
    pub email: String,
    pub password: String,
    pub display_name: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EmailLoginInput {
    pub email: String,
    pub password: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NewEmailAccount {
    pub provider: String,
    pub subject: String,
    pub display_label: String,
    pub display_name: String,
    pub password_hash: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StoredEmailAccount<Account> {
    pub account: Account,
    pub password_hash: Option<String>,
    pub disabled: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EmailAuthSession<Account> {
    pub account: Account,
    pub token: String,
    pub token_type: String,
}

pub trait EmailAuthStore {
    type Account;
    type Error: std::fmt::Display;

    fn registration_enabled(&self) -> Result<bool, Self::Error>;

    fn email_identity_exists(
        &self,
        provider: &str,
        subject: &str,
    ) -> Result<bool, Self::Error>;

    fn create_email_account(
        &mut self,
        account: NewEmailAccount,
    ) -> Result<Self::Account, Self::Error>;

    fn find_email_account(
        &self,
        provider: &str,
        subject: &str,
    ) -> Result<Option<StoredEmailAccount<Self::Account>>, Self::Error>;

    fn create_session(
        &mut self,
        account: &Self::Account,
        token_hash: &str,
    ) -> Result<(), Self::Error>;
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::{AuthError, AuthServices};

    use super::{
        EmailAuthStore, EmailLoginInput, EmailRegisterInput, NewEmailAccount, StoredEmailAccount,
    };

    #[derive(Clone, Debug, PartialEq, Eq)]
    struct FakeAccount {
        id: u64,
        email: String,
        display_name: String,
        password_hash: Option<String>,
        disabled: bool,
    }

    #[derive(Default)]
    struct FakeStore {
        registration_enabled: bool,
        next_id: u64,
        identities: HashMap<(String, String), u64>,
        accounts: HashMap<u64, FakeAccount>,
        sessions: HashMap<String, u64>,
    }

    impl FakeStore {
        fn enabled() -> Self {
            Self {
                registration_enabled: true,
                next_id: 1,
                ..Self::default()
            }
        }
    }

    impl EmailAuthStore for FakeStore {
        type Account = FakeAccount;
        type Error = String;

        fn registration_enabled(&self) -> Result<bool, Self::Error> {
            Ok(self.registration_enabled)
        }

        fn email_identity_exists(
            &self,
            provider: &str,
            subject: &str,
        ) -> Result<bool, Self::Error> {
            Ok(self
                .identities
                .contains_key(&(provider.to_string(), subject.to_string())))
        }

        fn create_email_account(
            &mut self,
            account: NewEmailAccount,
        ) -> Result<Self::Account, Self::Error> {
            let id = self.next_id;
            self.next_id += 1;
            self.identities
                .insert((account.provider, account.subject.clone()), id);
            let account = FakeAccount {
                id,
                email: account.subject,
                display_name: account.display_name,
                password_hash: Some(account.password_hash),
                disabled: false,
            };
            self.accounts.insert(id, account.clone());
            Ok(account)
        }

        fn find_email_account(
            &self,
            provider: &str,
            subject: &str,
        ) -> Result<Option<StoredEmailAccount<Self::Account>>, Self::Error> {
            let Some(id) = self
                .identities
                .get(&(provider.to_string(), subject.to_string()))
            else {
                return Ok(None);
            };
            let Some(account) = self.accounts.get(id).cloned() else {
                return Ok(None);
            };
            Ok(Some(StoredEmailAccount {
                password_hash: account.password_hash.clone(),
                disabled: account.disabled,
                account,
            }))
        }

        fn create_session(
            &mut self,
            account: &Self::Account,
            token_hash: &str,
        ) -> Result<(), Self::Error> {
            self.sessions.insert(token_hash.to_string(), account.id);
            Ok(())
        }
    }

    #[test]
    fn email_register_creates_account_and_session() {
        let auth = AuthServices::default();
        let mut store = FakeStore::enabled();

        let session = auth
            .email()
            .register(
                &mut store,
                auth.passwords(),
                auth.secrets(),
                EmailRegisterInput {
                    email: " USER@Example.COM ".to_string(),
                    password: "Password123!".to_string(),
                    display_name: None,
                },
            )
            .expect("registration should succeed");

        assert_eq!(session.account.email, "user@example.com");
        assert_eq!(session.account.display_name, "user@example.com");
        assert!(session.token.starts_with("lp_sess_"));
        assert_eq!(store.sessions.len(), 1);
    }

    #[test]
    fn email_login_uses_existing_password_hash() {
        let auth = AuthServices::default();
        let mut store = FakeStore::enabled();
        auth.email()
            .register(
                &mut store,
                auth.passwords(),
                auth.secrets(),
                EmailRegisterInput {
                    email: "user@example.com".to_string(),
                    password: "Password123!".to_string(),
                    display_name: Some("User".to_string()),
                },
            )
            .expect("registration should succeed");

        let session = auth
            .email()
            .login(
                &mut store,
                auth.passwords(),
                auth.secrets(),
                EmailLoginInput {
                    email: "USER@example.com".to_string(),
                    password: "Password123!".to_string(),
                },
            )
            .expect("login should succeed");

        assert_eq!(session.account.email, "user@example.com");
        assert_eq!(store.sessions.len(), 2);
    }

    #[test]
    fn email_login_rejects_wrong_password() {
        let auth = AuthServices::default();
        let mut store = FakeStore::enabled();
        auth.email()
            .register(
                &mut store,
                auth.passwords(),
                auth.secrets(),
                EmailRegisterInput {
                    email: "user@example.com".to_string(),
                    password: "Password123!".to_string(),
                    display_name: None,
                },
            )
            .expect("registration should succeed");

        let error = auth
            .email()
            .login(
                &mut store,
                auth.passwords(),
                auth.secrets(),
                EmailLoginInput {
                    email: "user@example.com".to_string(),
                    password: "wrong-password".to_string(),
                },
            )
            .expect_err("wrong password should fail");

        assert!(matches!(error, AuthError::InvalidCredentials));
    }
}
