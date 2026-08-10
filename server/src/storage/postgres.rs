use std::{
    collections::{BTreeSet, HashMap, HashSet},
    future::Future,
};

use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, Mac};
use lockpass_server_auth::{
    AuthServices, EmailAuthStore, EmailLoginInput, EmailRegisterInput, NewEmailAccount,
    PasswordHasher, StoredEmailAccount, DEVICE_TOKEN_PREFIX, SESSION_TOKEN_PREFIX,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::Sha256;
use sqlx::{postgres::PgRow, PgConnection, PgPool, Postgres, Row, Transaction};
use tracing::info;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    model::{
        AccountRecord, AccountView, AdminAccountPatchRequest, AdminConfigPatchRequest,
        AuditLogView, AuthPrincipal, AuthResponse, DeviceBindResponse, DeviceRecord, DeviceView,
        EmailChallengePurpose, EmailServiceConfig, EmailStartResponse, EmailVerifyResponse,
        IdentityRecord, IdentityView, InstanceConfig, MeResponse, SyncConflict, SyncEventView,
        SyncObjectRecord, SyncObjectView, SyncPullResponse, SyncPushAccepted, SyncPushObject,
        SyncPushRejected, SyncPushResponse, SyncSnapshotQuery, SyncSnapshotResponse,
        SyncSpaceCreateResponse, SyncSpaceRecord, SyncSpacesResponse, UsageResponse,
        WrappedVaultKeyCreateRequest, WrappedVaultKeyCreateResponse, WrappedVaultKeyRecord,
        WrappedVaultKeysResponse,
    },
    rbac,
};

const INSTANCE_CONFIG_KEY: &str = "server";
const EMAIL_CODE_TTL_MINUTES: i64 = 10;
const EMAIL_CODE_RESEND_SECONDS: i64 = 60;
const EMAIL_CODE_MAX_ATTEMPTS: i32 = 5;
const ACCOUNT_SETUP_TOKEN_TTL_MINUTES: i64 = 15;
const ACCOUNT_SETUP_TOKEN_PREFIX: &str = "lp_setup";
const MAX_SYNC_OBJECT_BYTES: usize = 256 * 1024;
const MAX_PUSH_OBJECTS: usize = 100;
const MAX_PUSH_BATCH_PAYLOAD_BYTES: usize = 5 * 1024 * 1024;
const DEFAULT_SYNC_SPACE_DISPLAY_NAME: &str = "default";

#[derive(Clone)]
pub struct PostgresStore {
    pool: PgPool,
    auth: AuthServices,
}

impl PostgresStore {
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool,
            auth: AuthServices::default(),
        }
    }

    pub async fn initialize(&self) -> AppResult<()> {
        info!("acquiring storage initialization connection");
        let mut connection = self.pool.acquire().await?;
        info!("seeding RBAC data");
        seed_rbac(&mut connection).await?;
        info!("ensuring instance config");
        save_instance_config_if_missing(&mut connection, InstanceConfig::default()).await
    }

    pub async fn account_count(&self) -> AppResult<i64> {
        sqlx::query_scalar("select count(*) from accounts")
            .fetch_one(&self.pool)
            .await
            .map_err(AppError::from)
    }

    pub fn create_bootstrap_admin(&self, username: &str, password: &str) -> AppResult<AccountView> {
        let username = normalize_admin_username(username)?;
        let password_hash = self.auth.passwords().hash(password)?;
        let pool = self.pool.clone();

        run_blocking(async move {
            let now = Utc::now();
            let mut tx = pool.begin().await?;
            let account_count: i64 = sqlx::query_scalar("select count(*) from accounts")
                .fetch_one(&mut *tx)
                .await?;
            if account_count > 0 {
                return Err(AppError::Conflict(
                    "bootstrap admin can only be created when no account exists".to_string(),
                ));
            }

            let account_id = Uuid::new_v4();
            let role_id = ensure_role_tx(&mut tx, rbac::ROLE_ADMIN).await?;
            let email = if username.contains('@') {
                Some(username.clone())
            } else {
                None
            };

            sqlx::query(
                "insert into accounts (id, display_name, email, password_hash, created_at, updated_at, disabled_at) \
                 values ($1, $2, $3, $4, $5, $6, $7)",
            )
            .bind(account_id)
            .bind(&username)
            .bind(&email)
            .bind(&password_hash)
            .bind(now)
            .bind(now)
            .bind(Option::<DateTime<Utc>>::None)
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                "insert into account_identities (id, account_id, provider, provider_subject, display_label, created_at) \
                 values ($1, $2, 'password', $3, $4, $5)",
            )
            .bind(Uuid::new_v4())
            .bind(account_id)
            .bind(&username)
            .bind(&username)
            .bind(now)
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                "insert into account_roles (account_id, role_id, granted_by, created_at) values ($1, $2, $3::uuid, $4)",
            )
            .bind(account_id)
            .bind(role_id)
            .bind(Option::<Uuid>::None)
            .bind(now)
            .execute(&mut *tx)
            .await?;

            let roles = fetch_account_roles_in_tx(&mut tx, account_id).await?;
            tx.commit().await?;

            Ok(AccountRecord {
                id: account_id,
                display_name: username,
                email,
                password_hash: Some(password_hash),
                disabled_at: None,
                created_at: now,
                updated_at: now,
                roles,
            }
            .to_view())
        })
    }

    pub fn start_email_challenge(
        &self,
        email: &str,
        display_name: Option<String>,
        purpose: EmailChallengePurpose,
    ) -> AppResult<(EmailStartResponse, String, EmailServiceConfig)> {
        let identity = self.auth.email().normalize_email(email)?;
        let email = identity.subject().to_string();
        let display_name = normalize_display_name(display_name);
        let pool = self.pool.clone();
        let auth = self.auth.clone();

        run_blocking(async move {
            let config = load_instance_config(&pool).await?;
            if !config.registration_enabled && purpose == EmailChallengePurpose::Register {
                return Err(AppError::Forbidden);
            }

            let identity_exists: bool = sqlx::query_scalar(
                "select exists(select 1 from account_identities where provider = 'email' and provider_subject = $1)",
            )
            .bind(&email)
            .fetch_one(&pool)
            .await?;

            match purpose {
                EmailChallengePurpose::Register if identity_exists => {
                    return Err(AppError::ConflictCode {
                        code: "account_exists",
                        message: "account already exists".to_string(),
                    });
                }
                EmailChallengePurpose::Login if !identity_exists => {
                    return Err(AppError::NotFound("account not found".to_string()));
                }
                _ => {}
            }

            let now = Utc::now();
            let recent_resend_after: Option<DateTime<Utc>> = sqlx::query_scalar(
                "select resend_after from email_challenges \
                 where email = $1 and purpose = $2 and consumed_at is null and resend_after > $3 \
                 order by created_at desc limit 1",
            )
            .bind(&email)
            .bind(purpose.as_str())
            .bind(now)
            .fetch_optional(&pool)
            .await?;
            if let Some(resend_after) = recent_resend_after {
                let remaining = (resend_after - now).num_seconds().max(1);
                return Err(AppError::TooManyRequests {
                    retry_after_seconds: remaining,
                    message: "email code was sent recently".to_string(),
                });
            }

            let challenge_id = Uuid::new_v4();
            let code = generate_email_code(&auth);
            let code_hash = hash_email_code(
                &config.email.code_secret,
                challenge_id,
                &email,
                purpose,
                &code,
            );
            let expires_at = now + Duration::minutes(EMAIL_CODE_TTL_MINUTES);
            let resend_after = now + Duration::seconds(EMAIL_CODE_RESEND_SECONDS);

            sqlx::query(
                "insert into email_challenges \
                 (id, email, display_name, purpose, code_hash, attempts, expires_at, resend_after, verified_at, consumed_at, created_at) \
                 values ($1, $2, $3, $4, $5, 0, $6, $7, null, null, $8)",
            )
            .bind(challenge_id)
            .bind(&email)
            .bind(&display_name)
            .bind(purpose.as_str())
            .bind(code_hash)
            .bind(expires_at)
            .bind(resend_after)
            .bind(now)
            .execute(&pool)
            .await?;

            Ok((
                EmailStartResponse {
                    challenge_id,
                    email,
                    expires_at,
                    resend_after_seconds: EMAIL_CODE_RESEND_SECONDS,
                },
                code,
                config.email,
            ))
        })
    }

    pub fn verify_email_challenge(
        &self,
        challenge_id: Uuid,
        code: &str,
    ) -> AppResult<EmailVerifyResponse> {
        let code = normalize_email_code(code)?;
        let pool = self.pool.clone();
        let auth = self.auth.clone();

        run_blocking(async move {
            let now = Utc::now();
            let config = load_instance_config(&pool).await?;
            let mut tx = pool.begin().await?;
            let Some(row) = sqlx::query(
                "select id, email, display_name, purpose, code_hash, attempts, expires_at, verified_at, consumed_at \
                 from email_challenges where id = $1 for update",
            )
            .bind(challenge_id)
            .fetch_optional(&mut *tx)
            .await?
            else {
                return Err(AppError::BadRequest("invalid email challenge".to_string()));
            };

            let email: String = row.try_get("email")?;
            let display_name: Option<String> = row.try_get("display_name")?;
            let purpose = parse_email_challenge_purpose(row.try_get::<String, _>("purpose")?)?;
            let code_hash: String = row.try_get("code_hash")?;
            let attempts: i32 = row.try_get("attempts")?;
            let expires_at: DateTime<Utc> = row.try_get("expires_at")?;
            let verified_at: Option<DateTime<Utc>> = row.try_get("verified_at")?;
            let consumed_at: Option<DateTime<Utc>> = row.try_get("consumed_at")?;

            if consumed_at.is_some() {
                return Err(AppError::BadRequest(
                    "email challenge was already used".to_string(),
                ));
            }
            if verified_at.is_some() {
                return Err(AppError::BadRequest(
                    "email challenge was already verified".to_string(),
                ));
            }
            if expires_at <= now {
                return Err(AppError::BadRequest("email code expired".to_string()));
            }
            if attempts >= EMAIL_CODE_MAX_ATTEMPTS {
                return Err(AppError::TooManyRequests {
                    retry_after_seconds: (expires_at - now).num_seconds().max(1),
                    message: "too many email code attempts".to_string(),
                });
            }

            let expected = hash_email_code(
                &config.email.code_secret,
                challenge_id,
                &email,
                purpose,
                &code,
            );
            if !constant_time_eq(expected.as_bytes(), code_hash.as_bytes()) {
                sqlx::query("update email_challenges set attempts = attempts + 1 where id = $1")
                    .bind(challenge_id)
                    .execute(&mut *tx)
                    .await?;
                tx.commit().await?;
                return Err(AppError::Unauthorized);
            }

            sqlx::query("update email_challenges set verified_at = $1 where id = $2")
                .bind(now)
                .bind(challenge_id)
                .execute(&mut *tx)
                .await?;

            let token = auth.secrets().issue(ACCOUNT_SETUP_TOKEN_PREFIX);
            let token_expires_at = now + Duration::minutes(ACCOUNT_SETUP_TOKEN_TTL_MINUTES);
            sqlx::query(
                "insert into account_setup_tokens \
                 (token_hash, challenge_id, email, display_name, purpose, expires_at, consumed_at, created_at) \
                 values ($1, $2, $3, $4, $5, $6, null, $7)",
            )
            .bind(token.hash())
            .bind(challenge_id)
            .bind(&email)
            .bind(&display_name)
            .bind(purpose.as_str())
            .bind(token_expires_at)
            .bind(now)
            .execute(&mut *tx)
            .await?;

            tx.commit().await?;

            Ok(EmailVerifyResponse {
                account_setup_token: token.into_value(),
                email,
                display_name,
                purpose,
                expires_at: token_expires_at,
            })
        })
    }

    pub fn complete_email_login(&self, setup_token: &str) -> AppResult<AuthResponse> {
        let pool = self.pool.clone();
        let auth = self.auth.clone();
        let token_hash = self.auth.secrets().hash(setup_token);

        run_blocking(async move {
            let now = Utc::now();
            let mut tx = pool.begin().await?;
            let Some(row) = sqlx::query(
                "select token_hash, challenge_id, email, purpose, expires_at, consumed_at \
                 from account_setup_tokens where token_hash = $1 for update",
            )
            .bind(&token_hash)
            .fetch_optional(&mut *tx)
            .await?
            else {
                return Err(AppError::Unauthorized);
            };

            let challenge_id: Uuid = row.try_get("challenge_id")?;
            let email: String = row.try_get("email")?;
            let purpose = parse_email_challenge_purpose(row.try_get::<String, _>("purpose")?)?;
            let expires_at: DateTime<Utc> = row.try_get("expires_at")?;
            let consumed_at: Option<DateTime<Utc>> = row.try_get("consumed_at")?;

            if purpose != EmailChallengePurpose::Login {
                return Err(AppError::Forbidden);
            }
            if consumed_at.is_some() || expires_at <= now {
                return Err(AppError::Unauthorized);
            }

            let account = fetch_account_by_identity_in_tx(&mut tx, "email", &email)
                .await?
                .ok_or(AppError::Unauthorized)?;
            if account.disabled_at.is_some() {
                return Err(AppError::Forbidden);
            }

            sqlx::query("update account_setup_tokens set consumed_at = $1 where token_hash = $2")
                .bind(now)
                .bind(&token_hash)
                .execute(&mut *tx)
                .await?;
            sqlx::query("update email_challenges set consumed_at = $1 where id = $2")
                .bind(now)
                .bind(challenge_id)
                .execute(&mut *tx)
                .await?;

            let session = auth.secrets().issue(SESSION_TOKEN_PREFIX);
            sqlx::query(
                "insert into auth_sessions (token_hash, account_id, expires_at, created_at) values ($1, $2, $3, $4)",
            )
            .bind(session.hash())
            .bind(account.id)
            .bind(now + Duration::days(30))
            .bind(now)
            .execute(&mut *tx)
            .await?;

            tx.commit().await?;

            Ok(AuthResponse {
                account: account.to_view(),
                token: session.into_value(),
                token_type: "Bearer".to_string(),
            })
        })
    }

    pub fn complete_email_account_setup(
        &self,
        setup_token: &str,
        device_name: String,
        client_device_id: Option<String>,
        client_ip: Option<String>,
    ) -> AppResult<DeviceBindResponse> {
        if device_name.trim().is_empty() {
            return Err(AppError::BadRequest("device name is required".to_string()));
        }
        let pool = self.pool.clone();
        let auth = self.auth.clone();
        let token_hash = self.auth.secrets().hash(setup_token);
        let name = device_name.trim().to_string();
        let client_device_id = normalize_client_device_id(client_device_id);

        run_blocking(async move {
            let now = Utc::now();
            let mut tx = pool.begin().await?;
            let Some(row) = sqlx::query(
                "select token_hash, challenge_id, email, display_name, purpose, expires_at, consumed_at \
                 from account_setup_tokens where token_hash = $1 for update",
            )
            .bind(&token_hash)
            .fetch_optional(&mut *tx)
            .await?
            else {
                return Err(AppError::Unauthorized);
            };

            let challenge_id: Uuid = row.try_get("challenge_id")?;
            let email: String = row.try_get("email")?;
            let display_name: Option<String> = row.try_get("display_name")?;
            let purpose = parse_email_challenge_purpose(row.try_get::<String, _>("purpose")?)?;
            let expires_at: DateTime<Utc> = row.try_get("expires_at")?;
            let consumed_at: Option<DateTime<Utc>> = row.try_get("consumed_at")?;

            if purpose != EmailChallengePurpose::Register {
                return Err(AppError::Forbidden);
            }
            if consumed_at.is_some() || expires_at <= now {
                return Err(AppError::Unauthorized);
            }

            let existing_account =
                fetch_account_by_identity_in_tx(&mut tx, "email", &email).await?;
            if existing_account.is_some() {
                return Err(AppError::ConflictCode {
                    code: "account_exists",
                    message: "account already exists".to_string(),
                });
            }

            let account = create_email_account_without_password_tx(
                &mut tx,
                "email",
                &email,
                &email,
                display_name.as_deref().unwrap_or(&email),
            )
            .await?;
            sqlx::query("update account_setup_tokens set consumed_at = $1 where token_hash = $2")
                .bind(now)
                .bind(&token_hash)
                .execute(&mut *tx)
                .await?;
            sqlx::query("update email_challenges set consumed_at = $1 where id = $2")
                .bind(now)
                .bind(challenge_id)
                .execute(&mut *tx)
                .await?;
            tx.commit().await?;

            let (device, device_token) = create_or_update_device(
                &pool,
                &auth,
                account.id,
                client_device_id,
                name,
                client_ip,
            )
            .await?;

            Ok(DeviceBindResponse {
                account: account.to_view(),
                device: device.to_view(),
                device_token,
                token_type: "Bearer".to_string(),
            })
        })
    }

    pub fn register_email(
        &self,
        email: &str,
        password: &str,
        display_name: Option<String>,
    ) -> AppResult<AuthResponse> {
        let auth = self.auth.clone();
        let mut store = PostgresEmailAuthStore {
            pool: self.pool.clone(),
        };
        let session = auth.email().register(
            &mut store,
            auth.passwords(),
            auth.secrets(),
            EmailRegisterInput {
                email: email.to_string(),
                password: password.to_string(),
                display_name,
            },
        )?;

        Ok(AuthResponse {
            account: session.account.to_view(),
            token: session.token,
            token_type: session.token_type,
        })
    }

    pub fn login_email(&self, email: &str, password: &str) -> AppResult<AuthResponse> {
        let auth = self.auth.clone();
        let mut store = PostgresEmailAuthStore {
            pool: self.pool.clone(),
        };
        let session = auth.email().login(
            &mut store,
            auth.passwords(),
            auth.secrets(),
            EmailLoginInput {
                email: email.to_string(),
                password: password.to_string(),
            },
        )?;

        Ok(AuthResponse {
            account: session.account.to_view(),
            token: session.token,
            token_type: session.token_type,
        })
    }

    pub fn login_admin_password(&self, username: &str, password: &str) -> AppResult<AuthResponse> {
        let username = normalize_admin_username(username)?;
        let pool = self.pool.clone();
        let auth = self.auth.clone();
        let password = password.to_string();

        run_blocking(async move {
            let account = fetch_account_by_identity(&pool, "password", &username)
                .await?
                .ok_or(AppError::Unauthorized)?;
            if account.disabled_at.is_some() || !account.roles.contains(rbac::ROLE_ADMIN) {
                return Err(AppError::Forbidden);
            }
            let password_hash = account
                .password_hash
                .as_deref()
                .ok_or(AppError::Unauthorized)?;
            auth.passwords().verify(password_hash, &password)?;

            let session = auth.secrets().issue(SESSION_TOKEN_PREFIX);
            let now = Utc::now();
            sqlx::query(
                "insert into auth_sessions (token_hash, account_id, expires_at, created_at) values ($1, $2, $3, $4)",
            )
            .bind(session.hash())
            .bind(account.id)
            .bind(now + Duration::days(30))
            .bind(now)
            .execute(&pool)
            .await?;

            Ok(AuthResponse {
                account: account.to_view(),
                token: session.into_value(),
                token_type: "Bearer".to_string(),
            })
        })
    }

    pub fn logout_bearer(&self, token: &str) -> AppResult<()> {
        let pool = self.pool.clone();
        let token_hash = self.auth.secrets().hash(token);
        run_blocking(async move {
            sqlx::query("delete from auth_sessions where token_hash = $1")
                .bind(token_hash)
                .execute(&pool)
                .await?;
            Ok(())
        })
    }

    pub fn authenticate_bearer(
        &self,
        token: &str,
        client_ip: Option<String>,
    ) -> AppResult<AuthPrincipal> {
        let pool = self.pool.clone();
        let token_hash = self.auth.secrets().hash(token);
        run_blocking(async move {
            let now = Utc::now();
            let session = sqlx::query(
                "select account_id, expires_at from auth_sessions where token_hash = $1",
            )
            .bind(&token_hash)
            .fetch_optional(&pool)
            .await?;

            if let Some(row) = session {
                let account_id: Uuid = row.try_get("account_id")?;
                let expires_at: chrono::DateTime<Utc> = row.try_get("expires_at")?;
                if expires_at < now {
                    sqlx::query("delete from auth_sessions where token_hash = $1")
                        .bind(&token_hash)
                        .execute(&pool)
                        .await?;
                    return Err(AppError::Unauthorized);
                }

                let account = fetch_account_required(&pool, account_id).await?;
                if account.disabled_at.is_some() {
                    return Err(AppError::Forbidden);
                }

                return Ok(AuthPrincipal {
                    account_id,
                    device_id: None,
                    token_scopes: BTreeSet::new(),
                    roles: account.roles,
                });
            }

            let device = sqlx::query(
                "select id, account_id, client_device_id, name, remark, token_hash, token_scopes, last_seen_at, last_seen_ip, revoked_at, created_at \
                 from devices where token_hash = $1 and revoked_at is null",
            )
            .bind(&token_hash)
            .fetch_optional(&pool)
            .await?
            .map(row_to_device)
            .transpose()?
            .ok_or(AppError::Unauthorized)?;

            sqlx::query("update devices set last_seen_at = $1, last_seen_ip = coalesce($2, last_seen_ip) where id = $3")
                .bind(now)
                .bind(client_ip)
                .bind(device.id)
                .execute(&pool)
                .await?;

            let account = fetch_account_required(&pool, device.account_id).await?;
            if account.disabled_at.is_some() {
                return Err(AppError::Forbidden);
            }

            Ok(AuthPrincipal {
                account_id: device.account_id,
                device_id: Some(device.id),
                token_scopes: device.token_scopes.iter().cloned().collect(),
                roles: account.roles,
            })
        })
    }

    pub fn me(&self, principal: &AuthPrincipal) -> AppResult<MeResponse> {
        let pool = self.pool.clone();
        let principal = principal.clone();
        run_blocking(async move {
            let account = fetch_account_required(&pool, principal.account_id).await?;
            let device = if let Some(device_id) = principal.device_id {
                fetch_device(&pool, principal.account_id, device_id)
                    .await?
                    .map(|device| device.to_view())
            } else {
                None
            };

            Ok(MeResponse {
                account: account.to_view(),
                device,
                roles: principal.roles.iter().cloned().collect(),
            })
        })
    }

    pub fn bind_device(
        &self,
        principal: &AuthPrincipal,
        device_name: String,
        client_device_id: Option<String>,
        client_ip: Option<String>,
    ) -> AppResult<DeviceBindResponse> {
        if device_name.trim().is_empty() {
            return Err(AppError::BadRequest("device name is required".to_string()));
        }
        if principal.device_id.is_some() {
            return Err(AppError::Forbidden);
        }

        let pool = self.pool.clone();
        let auth = self.auth.clone();
        let account_id = principal.account_id;
        let name = device_name.trim().to_string();
        let client_device_id = normalize_client_device_id(client_device_id);
        run_blocking(async move {
            let (device, device_token) = create_or_update_device(
                &pool,
                &auth,
                account_id,
                client_device_id,
                name,
                client_ip,
            )
            .await?;
            let account = fetch_account_required(&pool, account_id).await?;

            Ok(DeviceBindResponse {
                account: account.to_view(),
                device: device.to_view(),
                device_token,
                token_type: "Bearer".to_string(),
            })
        })
    }

    pub fn list_devices(&self, account_id: Uuid) -> AppResult<Vec<DeviceView>> {
        let pool = self.pool.clone();
        run_blocking(async move {
            let rows = sqlx::query(
                "select id, account_id, client_device_id, name, remark, token_hash, token_scopes, last_seen_at, last_seen_ip, revoked_at, created_at \
                 from devices where account_id = $1 order by created_at desc",
            )
            .bind(account_id)
            .fetch_all(&pool)
            .await?;
            rows.into_iter()
                .map(row_to_device)
                .map(|result| result.map(|device| device.to_view()))
                .collect()
        })
    }

    pub fn update_device_remark(
        &self,
        account_id: Uuid,
        device_id: Uuid,
        remark: Option<String>,
    ) -> AppResult<DeviceView> {
        let pool = self.pool.clone();
        let remark = normalize_device_remark(remark);
        run_blocking(async move {
            let row = sqlx::query(
                "update devices set remark = $1 where id = $2 and account_id = $3 \
                 returning id, account_id, client_device_id, name, remark, token_hash, token_scopes, last_seen_at, last_seen_ip, revoked_at, created_at",
            )
            .bind(remark)
            .bind(device_id)
            .bind(account_id)
            .fetch_optional(&pool)
            .await?
            .ok_or_else(|| AppError::NotFound("device not found".to_string()))?;
            Ok(row_to_device(row)?.to_view())
        })
    }

    pub fn revoke_device(&self, account_id: Uuid, device_id: Uuid) -> AppResult<()> {
        let pool = self.pool.clone();
        run_blocking(async move {
            let result =
                sqlx::query("update devices set revoked_at = $1 where id = $2 and account_id = $3")
                    .bind(Utc::now())
                    .bind(device_id)
                    .bind(account_id)
                    .execute(&pool)
                    .await?;
            if result.rows_affected() == 0 {
                return Err(AppError::NotFound("device not found".to_string()));
            }
            Ok(())
        })
    }

    pub fn list_sync_spaces(&self, principal: &AuthPrincipal) -> AppResult<SyncSpacesResponse> {
        let pool = self.pool.clone();
        let principal = principal.clone();
        run_blocking(async move {
            ensure_sync_scope(&principal, "sync:read")?;
            let rows = sqlx::query(
                "select id, account_id, display_name, encrypted_metadata, created_at, updated_at \
                 from sync_spaces where account_id = $1 order by created_at asc",
            )
            .bind(principal.account_id)
            .fetch_all(&pool)
            .await?;
            let sync_spaces = rows
                .into_iter()
                .map(row_to_sync_space)
                .map(|result| result.map(|space| space.to_view()))
                .collect::<AppResult<Vec<_>>>()?;

            Ok(SyncSpacesResponse { sync_spaces })
        })
    }

    pub fn create_sync_space(
        &self,
        principal: &AuthPrincipal,
        _display_name: Option<String>,
        encrypted_metadata: Option<Value>,
    ) -> AppResult<SyncSpaceCreateResponse> {
        let pool = self.pool.clone();
        let principal = principal.clone();
        run_blocking(async move {
            ensure_sync_scope(&principal, "sync:write")?;
            let now = Utc::now();
            let display_name = DEFAULT_SYNC_SPACE_DISPLAY_NAME.to_string();

            if let Some(existing) = sqlx::query(
                "select id, account_id, display_name, encrypted_metadata, created_at, updated_at \
                 from sync_spaces where account_id = $1 and display_name = $2",
            )
            .bind(principal.account_id)
            .bind(&display_name)
            .fetch_optional(&pool)
            .await?
            {
                return Ok(SyncSpaceCreateResponse {
                    sync_space: row_to_sync_space(existing)?.to_view(),
                });
            }

            let record = SyncSpaceRecord {
                id: Uuid::new_v4(),
                account_id: principal.account_id,
                display_name,
                encrypted_metadata: encrypted_metadata.unwrap_or_else(|| json!({})),
                created_at: now,
                updated_at: now,
            };

            sqlx::query(
                "insert into sync_spaces (id, account_id, display_name, encrypted_metadata, created_at, updated_at) \
                 values ($1, $2, $3, $4, $5, $6)",
            )
            .bind(record.id)
            .bind(record.account_id)
            .bind(&record.display_name)
            .bind(&record.encrypted_metadata)
            .bind(record.created_at)
            .bind(record.updated_at)
            .execute(&pool)
            .await?;

            Ok(SyncSpaceCreateResponse {
                sync_space: record.to_view(),
            })
        })
    }

    pub fn list_wrapped_vault_keys(
        &self,
        principal: &AuthPrincipal,
        sync_space_id: Uuid,
    ) -> AppResult<WrappedVaultKeysResponse> {
        let pool = self.pool.clone();
        let principal = principal.clone();
        run_blocking(async move {
            ensure_sync_scope(&principal, "sync:read")?;
            ensure_sync_space_exists(&pool, principal.account_id, sync_space_id).await?;
            let rows = sqlx::query(
                "select id, account_id, sync_space_id, vault_id, key_id, wrap_type, generation, \
                        kdf_params, wrapped_vault_key, created_by_device_id, created_at, revoked_at \
                 from wrapped_vault_keys \
                 where account_id = $1 and sync_space_id = $2 and revoked_at is null \
                 order by vault_id asc, key_id asc, generation desc",
            )
            .bind(principal.account_id)
            .bind(sync_space_id)
            .fetch_all(&pool)
            .await?;
            let wrapped_vault_keys = rows
                .into_iter()
                .map(row_to_wrapped_vault_key)
                .map(|result| result.map(|key| key.to_view()))
                .collect::<AppResult<Vec<_>>>()?;

            Ok(WrappedVaultKeysResponse { wrapped_vault_keys })
        })
    }

    pub fn create_wrapped_vault_key(
        &self,
        principal: &AuthPrincipal,
        payload: WrappedVaultKeyCreateRequest,
    ) -> AppResult<WrappedVaultKeyCreateResponse> {
        if payload.key_id.trim().is_empty() {
            return Err(AppError::BadRequest("keyId is required".to_string()));
        }
        if payload.wrap_type != "user_wrapped" {
            return Err(AppError::BadRequest(
                "wrapType must be user_wrapped".to_string(),
            ));
        }
        payload.validate_envelope().map_err(AppError::BadRequest)?;

        let pool = self.pool.clone();
        let principal = principal.clone();
        run_blocking(async move {
            let device_id = ensure_sync_scope(&principal, "sync:write")?;
            let mut tx = pool.begin().await?;
            let exists: bool = sqlx::query_scalar(
                "select exists(select 1 from sync_spaces where account_id = $1 and id = $2)",
            )
            .bind(principal.account_id)
            .bind(payload.sync_space_id)
            .fetch_one(&mut *tx)
            .await?;
            if !exists {
                return Err(AppError::NotFound("sync space not found".to_string()));
            }

            let current_generation: Option<i64> = sqlx::query_scalar(
                "select generation from wrapped_vault_keys \
                 where account_id = $1 and sync_space_id = $2 and vault_id = $3 and key_id = $4 \
                 order by generation desc limit 1 for update",
            )
            .bind(principal.account_id)
            .bind(payload.sync_space_id)
            .bind(payload.vault_id)
            .bind(&payload.key_id)
            .fetch_optional(&mut *tx)
            .await?;
            let generation = current_generation.unwrap_or(0) + 1;
            let now = Utc::now();

            if let Some(replaced_id) = payload.replaces_wrapped_vault_key_id {
                sqlx::query(
                    "update wrapped_vault_keys set revoked_at = coalesce(revoked_at, $1) \
                     where account_id = $2 and sync_space_id = $3 and id = $4",
                )
                .bind(now)
                .bind(principal.account_id)
                .bind(payload.sync_space_id)
                .bind(replaced_id)
                .execute(&mut *tx)
                .await?;
            }

            sqlx::query(
                "update wrapped_vault_keys set revoked_at = $1 \
                 where account_id = $2 and sync_space_id = $3 and vault_id = $4 and key_id = $5 and revoked_at is null",
            )
            .bind(now)
            .bind(principal.account_id)
            .bind(payload.sync_space_id)
            .bind(payload.vault_id)
            .bind(&payload.key_id)
            .execute(&mut *tx)
            .await?;

            let record = WrappedVaultKeyRecord {
                id: Uuid::new_v4(),
                account_id: principal.account_id,
                sync_space_id: payload.sync_space_id,
                vault_id: payload.vault_id,
                key_id: payload.key_id,
                wrap_type: payload.wrap_type,
                generation,
                kdf_params: payload.kdf_params,
                wrapped_vault_key: payload.wrapped_vault_key,
                created_by_device_id: Some(device_id),
                created_at: now,
                revoked_at: None,
            };

            sqlx::query(
                "insert into wrapped_vault_keys \
                 (id, account_id, sync_space_id, vault_id, key_id, wrap_type, generation, kdf_params, wrapped_vault_key, created_by_device_id, created_at, revoked_at) \
                 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
            )
            .bind(record.id)
            .bind(record.account_id)
            .bind(record.sync_space_id)
            .bind(record.vault_id)
            .bind(&record.key_id)
            .bind(&record.wrap_type)
            .bind(record.generation)
            .bind(&record.kdf_params)
            .bind(&record.wrapped_vault_key)
            .bind(record.created_by_device_id)
            .bind(record.created_at)
            .bind(record.revoked_at)
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;

            Ok(WrappedVaultKeyCreateResponse {
                wrapped_vault_key_record: record.to_metadata_view(),
            })
        })
    }

    pub fn sync_snapshot(
        &self,
        principal: &AuthPrincipal,
        query: SyncSnapshotQuery,
    ) -> AppResult<SyncSnapshotResponse> {
        let pool = self.pool.clone();
        let principal = principal.clone();
        run_blocking(async move {
            ensure_sync_scope(&principal, "sync:read")?;
            ensure_sync_space_exists(&pool, principal.account_id, query.sync_space_id).await?;

            let (offset, snapshot_cursor) = match query.page_token {
                Some(token) => parse_snapshot_page_token(&token)?,
                None => (0, latest_cursor(&pool, principal.account_id).await?),
            };
            let limit = query.limit.unwrap_or(500).clamp(1, 500) as i64;

            let key_rows = sqlx::query(
                "select id, account_id, sync_space_id, vault_id, key_id, wrap_type, generation, \
                        kdf_params, wrapped_vault_key, created_by_device_id, created_at, revoked_at \
                 from wrapped_vault_keys \
                 where account_id = $1 and sync_space_id = $2 and revoked_at is null \
                 order by vault_id asc, key_id asc, generation desc",
            )
            .bind(principal.account_id)
            .bind(query.sync_space_id)
            .fetch_all(&pool)
            .await?;
            let wrapped_vault_keys = key_rows
                .into_iter()
                .map(row_to_wrapped_vault_key)
                .map(|result| result.map(|key| key.to_view()))
                .collect::<AppResult<Vec<_>>>()?;

            let object_rows = sqlx::query_scalar::<_, Value>(
                "select object_snapshot \
                 from ( \
                   select distinct on (object_id) object_id, id, object_snapshot \
                   from sync_events \
                   where account_id = $1 and sync_space_id = $2 and id <= $3 \
                   order by object_id, id desc \
                 ) latest \
                 order by id asc, object_id asc offset $4 limit $5",
            )
            .bind(principal.account_id)
            .bind(query.sync_space_id)
            .bind(snapshot_cursor)
            .bind(offset)
            .bind(limit + 1)
            .fetch_all(&pool)
            .await?;
            let mut objects = object_rows
                .into_iter()
                .map(|value| {
                    serde_json::from_value::<SyncObjectView>(value).map_err(|error| {
                        AppError::Internal(format!("invalid sync object snapshot: {error}"))
                    })
                })
                .collect::<AppResult<Vec<_>>>()?;
            let has_more = objects.len() > limit as usize;
            if has_more {
                objects.truncate(limit as usize);
            }
            let next_page_token = if has_more {
                Some(format!("{}:{}", offset + limit, snapshot_cursor))
            } else {
                None
            };

            Ok(SyncSnapshotResponse {
                sync_space_id: query.sync_space_id,
                snapshot_cursor,
                generated_at: Utc::now(),
                wrapped_vault_keys,
                objects,
                includes_tombstones: true,
                next_page_token,
            })
        })
    }

    pub fn push_sync_objects(
        &self,
        principal: &AuthPrincipal,
        client_batch_id: Uuid,
        objects: Vec<SyncPushObject>,
    ) -> AppResult<SyncPushResponse> {
        if objects.len() > MAX_PUSH_OBJECTS {
            return Err(AppError::BadRequest(format!(
                "push object count exceeds {MAX_PUSH_OBJECTS}"
            )));
        }
        let total_payload_bytes =
            sync_batch_payload_bytes(&objects).map_err(AppError::BadRequest)?;
        if total_payload_bytes > MAX_PUSH_BATCH_PAYLOAD_BYTES {
            return Err(AppError::BadRequest(format!(
                "push payload bytes exceed {MAX_PUSH_BATCH_PAYLOAD_BYTES}"
            )));
        }

        let pool = self.pool.clone();
        let principal = principal.clone();
        run_blocking(async move {
            let device_id = ensure_sync_scope(&principal, "sync:write")?;
            let duplicate_pairs = duplicate_sync_object_pairs(&objects);
            let mut accepted = Vec::new();
            let mut conflicts = Vec::new();
            let mut rejected = Vec::new();

            for object in objects {
                let mut tx = pool.begin().await?;
                if let Some(outcome) = claim_idempotency_outcome_tx(
                    &mut tx,
                    principal.account_id,
                    device_id,
                    client_batch_id,
                    &object,
                )
                .await?
                {
                    tx.commit().await?;
                    append_sync_outcome(outcome, &mut accepted, &mut conflicts, &mut rejected);
                    continue;
                }

                if duplicate_pairs.contains(&(object.sync_space_id, object.object_id)) {
                    let outcome = sync_rejected(
                        &object,
                        "duplicate_object",
                        "duplicate syncSpaceId + objectId in the same batch",
                    );
                    save_idempotency_outcome_tx(
                        &mut tx,
                        principal.account_id,
                        device_id,
                        client_batch_id,
                        object.client_operation_id,
                        &outcome,
                    )
                    .await?;
                    tx.commit().await?;
                    append_sync_outcome(outcome, &mut accepted, &mut conflicts, &mut rejected);
                    continue;
                }

                if object.base_revision < 0
                    || object.revision < 1
                    || object.base_revision.checked_add(1) != Some(object.revision)
                {
                    let outcome = sync_rejected(
                        &object,
                        "invalid_revision",
                        "revision must equal baseRevision + 1",
                    );
                    save_idempotency_outcome_tx(
                        &mut tx,
                        principal.account_id,
                        device_id,
                        client_batch_id,
                        object.client_operation_id,
                        &outcome,
                    )
                    .await?;
                    tx.commit().await?;
                    append_sync_outcome(outcome, &mut accepted, &mut conflicts, &mut rejected);
                    continue;
                }

                if let Err(message) = object.validate_object_type() {
                    let outcome = sync_rejected(&object, "invalid_object_type", &message);
                    save_idempotency_outcome_tx(
                        &mut tx,
                        principal.account_id,
                        device_id,
                        client_batch_id,
                        object.client_operation_id,
                        &outcome,
                    )
                    .await?;
                    tx.commit().await?;
                    append_sync_outcome(outcome, &mut accepted, &mut conflicts, &mut rejected);
                    continue;
                }

                if let Err(message) = object.validate_encrypted_payload() {
                    let outcome = sync_rejected(&object, "invalid_encrypted_payload", &message);
                    save_idempotency_outcome_tx(
                        &mut tx,
                        principal.account_id,
                        device_id,
                        client_batch_id,
                        object.client_operation_id,
                        &outcome,
                    )
                    .await?;
                    tx.commit().await?;
                    append_sync_outcome(outcome, &mut accepted, &mut conflicts, &mut rejected);
                    continue;
                }

                let payload_bytes = match sync_payload_bytes(&object.encrypted_payload) {
                    Ok(payload_bytes) => payload_bytes,
                    Err(message) => {
                        let outcome = sync_rejected(&object, "payload_too_large", &message);
                        save_idempotency_outcome_tx(
                            &mut tx,
                            principal.account_id,
                            device_id,
                            client_batch_id,
                            object.client_operation_id,
                            &outcome,
                        )
                        .await?;
                        tx.commit().await?;
                        append_sync_outcome(outcome, &mut accepted, &mut conflicts, &mut rejected);
                        continue;
                    }
                };

                if !sync_space_exists_tx(&mut tx, principal.account_id, object.sync_space_id)
                    .await?
                {
                    let outcome =
                        sync_rejected(&object, "sync_space_not_found", "sync space not found");
                    save_idempotency_outcome_tx(
                        &mut tx,
                        principal.account_id,
                        device_id,
                        client_batch_id,
                        object.client_operation_id,
                        &outcome,
                    )
                    .await?;
                    tx.commit().await?;
                    append_sync_outcome(outcome, &mut accepted, &mut conflicts, &mut rejected);
                    continue;
                }

                let current = fetch_sync_object_for_update(
                    &mut tx,
                    principal.account_id,
                    object.sync_space_id,
                    object.object_id,
                )
                .await?;
                let current_revision = current.as_ref().map(|value| value.revision).unwrap_or(0);

                if current_revision != object.base_revision {
                    let outcome = SyncOperationOutcome::Conflict(SyncConflict {
                        client_operation_id: object.client_operation_id,
                        object_id: object.object_id,
                        expected_revision: object.base_revision,
                        current_revision,
                        server_object: current.map(|value| value.to_view()),
                    });
                    save_idempotency_outcome_tx(
                        &mut tx,
                        principal.account_id,
                        device_id,
                        client_batch_id,
                        object.client_operation_id,
                        &outcome,
                    )
                    .await?;
                    tx.commit().await?;
                    append_sync_outcome(outcome, &mut accepted, &mut conflicts, &mut rejected);
                    continue;
                }

                let now = Utc::now();
                let record = SyncObjectRecord {
                    object_id: object.object_id,
                    account_id: principal.account_id,
                    sync_space_id: object.sync_space_id,
                    vault_id: object.vault_id,
                    object_type: object.object_type,
                    revision: object.revision,
                    encrypted_payload: object.encrypted_payload,
                    payload_bytes,
                    updated_by_device_id: device_id,
                    deleted_at: object.deleted_at,
                    updated_at: now,
                };
                let event_type = if record.deleted_at.is_some() {
                    "deleted"
                } else if current_revision == 0 {
                    "created"
                } else {
                    "updated"
                };

                sqlx::query(
                    "insert into sync_objects \
                     (id, account_id, sync_space_id, vault_id, object_type, revision, encrypted_payload, payload_bytes, updated_by_device_id, deleted_at, updated_at) \
                     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) \
                     on conflict (account_id, sync_space_id, id) do update set \
                     vault_id = excluded.vault_id, object_type = excluded.object_type, revision = excluded.revision, \
                     encrypted_payload = excluded.encrypted_payload, payload_bytes = excluded.payload_bytes, \
                     updated_by_device_id = excluded.updated_by_device_id, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at",
                )
                .bind(record.object_id)
                .bind(record.account_id)
                .bind(record.sync_space_id)
                .bind(record.vault_id)
                .bind(&record.object_type)
                .bind(record.revision)
                .bind(&record.encrypted_payload)
                .bind(record.payload_bytes)
                .bind(record.updated_by_device_id)
                .bind(record.deleted_at)
                .bind(record.updated_at)
                .execute(&mut *tx)
                .await?;

                let event_id: i64 = sqlx::query_scalar(
                    "insert into sync_events \
                     (account_id, sync_space_id, object_id, object_revision, base_revision, event_type, object_snapshot, created_at) \
                     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id",
                )
                .bind(record.account_id)
                .bind(record.sync_space_id)
                .bind(record.object_id)
                .bind(record.revision)
                .bind(object.base_revision)
                .bind(event_type)
                .bind(json!(record.to_view()))
                .bind(now)
                .fetch_one(&mut *tx)
                .await?;

                let outcome = SyncOperationOutcome::Accepted(SyncPushAccepted {
                    client_operation_id: object.client_operation_id,
                    object_id: record.object_id,
                    revision: record.revision,
                    event_id,
                });
                save_idempotency_outcome_tx(
                    &mut tx,
                    principal.account_id,
                    device_id,
                    client_batch_id,
                    object.client_operation_id,
                    &outcome,
                )
                .await?;
                tx.commit().await?;
                append_sync_outcome(outcome, &mut accepted, &mut conflicts, &mut rejected);
            }

            let next_cursor = accepted
                .iter()
                .map(|item| item.event_id)
                .max()
                .unwrap_or(latest_cursor(&pool, principal.account_id).await?);
            Ok(SyncPushResponse {
                accepted,
                conflicts,
                rejected,
                next_cursor,
            })
        })
    }

    pub fn pull_sync_events(
        &self,
        principal: &AuthPrincipal,
        cursor: i64,
        limit: usize,
    ) -> AppResult<SyncPullResponse> {
        let pool = self.pool.clone();
        let principal = principal.clone();
        run_blocking(async move {
            ensure_sync_scope(&principal, "sync:read")?;
            let limit = limit.clamp(1, 500) as i64;
            let rows = sqlx::query(
                "select id, sync_space_id, event_type, object_id, object_revision, base_revision, object_snapshot, created_at \
                 from sync_events where account_id = $1 and id > $2 order by id asc limit $3",
            )
            .bind(principal.account_id)
            .bind(cursor)
            .bind(limit + 1)
            .fetch_all(&pool)
            .await?;
            let mut events = rows
                .into_iter()
                .map(row_to_sync_event)
                .collect::<AppResult<Vec<_>>>()?;
            let has_more = events.len() > limit as usize;
            if has_more {
                events.truncate(limit as usize);
            }
            let next_cursor = events.last().map(|event| event.id).unwrap_or(cursor);

            Ok(SyncPullResponse {
                cursor,
                next_cursor,
                has_more,
                events,
            })
        })
    }

    pub fn ack_sync_cursor(&self, principal: &AuthPrincipal, cursor: i64) -> AppResult<()> {
        let pool = self.pool.clone();
        let principal = principal.clone();
        run_blocking(async move {
            let device_id = ensure_sync_scope(&principal, "sync:write")?;
            let now = Utc::now();
            sqlx::query(
                "insert into device_sync_cursors (account_id, device_id, cursor, acked_at) \
                 values ($1, $2, $3, $4) \
                 on conflict (account_id, device_id) do update set \
                 cursor = greatest(device_sync_cursors.cursor, excluded.cursor), acked_at = excluded.acked_at",
            )
            .bind(principal.account_id)
            .bind(device_id)
            .bind(cursor.max(0))
            .bind(now)
            .execute(&pool)
            .await?;
            sqlx::query("update devices set last_seen_at = $1 where account_id = $2 and id = $3")
                .bind(now)
                .bind(principal.account_id)
                .bind(device_id)
                .execute(&pool)
                .await?;
            Ok(())
        })
    }

    pub fn profile(&self, account_id: Uuid) -> AppResult<AccountView> {
        let pool = self.pool.clone();
        run_blocking(async move { Ok(fetch_account_required(&pool, account_id).await?.to_view()) })
    }

    pub fn update_profile(
        &self,
        account_id: Uuid,
        display_name: Option<String>,
    ) -> AppResult<AccountView> {
        let pool = self.pool.clone();
        run_blocking(async move {
            if let Some(display_name) = display_name {
                if display_name.trim().is_empty() {
                    return Err(AppError::BadRequest("display name is required".to_string()));
                }
                let updated_at = Utc::now();
                sqlx::query("update accounts set display_name = $1, updated_at = $2 where id = $3")
                    .bind(display_name.trim())
                    .bind(updated_at)
                    .bind(account_id)
                    .execute(&pool)
                    .await?;
            }
            Ok(fetch_account_required(&pool, account_id).await?.to_view())
        })
    }

    pub fn identities(&self, account_id: Uuid) -> AppResult<Vec<IdentityView>> {
        let pool = self.pool.clone();
        run_blocking(async move {
            let rows = sqlx::query(
                "select id, account_id, provider, provider_subject, display_label, created_at \
                 from account_identities where account_id = $1 order by created_at asc",
            )
            .bind(account_id)
            .fetch_all(&pool)
            .await?;
            rows.into_iter()
                .map(row_to_identity)
                .map(|result| result.map(|identity| identity.to_view()))
                .collect()
        })
    }

    pub fn delete_identity(&self, account_id: Uuid, identity_id: Uuid) -> AppResult<()> {
        let pool = self.pool.clone();
        run_blocking(async move {
            let count: i64 =
                sqlx::query_scalar("select count(*) from account_identities where account_id = $1")
                    .bind(account_id)
                    .fetch_one(&pool)
                    .await?;
            if count <= 1 {
                return Err(AppError::Conflict(
                    "at least one login identity must remain".to_string(),
                ));
            }

            let result =
                sqlx::query("delete from account_identities where id = $1 and account_id = $2")
                    .bind(identity_id)
                    .bind(account_id)
                    .execute(&pool)
                    .await?;
            if result.rows_affected() == 0 {
                return Err(AppError::NotFound("identity not found".to_string()));
            }
            Ok(())
        })
    }

    pub fn usage(&self, account_id: Uuid) -> AppResult<UsageResponse> {
        let pool = self.pool.clone();
        run_blocking(async move {
            let devices: i64 =
                sqlx::query_scalar("select count(*) from devices where account_id = $1")
                    .bind(account_id)
                    .fetch_one(&pool)
                    .await?;
            let sync_objects: i64 =
                sqlx::query_scalar("select count(*) from sync_objects where account_id = $1")
                    .bind(account_id)
                    .fetch_one(&pool)
                    .await?;
            let sync_events: i64 =
                sqlx::query_scalar("select count(*) from sync_events where account_id = $1")
                    .bind(account_id)
                    .fetch_one(&pool)
                    .await?;
            let storage_bytes: Option<i64> = sqlx::query_scalar(
                "select sum(length(encrypted_payload::text)) from sync_objects where account_id = $1",
            )
            .bind(account_id)
            .fetch_one(&pool)
            .await?;

            Ok(UsageResponse {
                devices: devices as usize,
                sync_objects: sync_objects as usize,
                sync_events: sync_events as usize,
                storage_bytes: storage_bytes.unwrap_or(0) as usize,
            })
        })
    }

    pub fn admin_accounts(&self) -> AppResult<Vec<AccountView>> {
        let pool = self.pool.clone();
        run_blocking(async move {
            let rows = sqlx::query(
                "select id, display_name, email, password_hash, disabled_at, created_at, updated_at \
                 from accounts order by created_at desc",
            )
            .fetch_all(&pool)
            .await?;
            let mut accounts = Vec::with_capacity(rows.len());
            for row in rows {
                let id: Uuid = row.try_get("id")?;
                let roles = fetch_account_roles(&pool, id).await?;
                accounts.push(row_to_account(row, roles)?.to_view());
            }
            Ok(accounts)
        })
    }

    pub fn admin_change_password(
        &self,
        actor: &AuthPrincipal,
        current_password: &str,
        new_password: &str,
    ) -> AppResult<AuthResponse> {
        let pool = self.pool.clone();
        let auth = self.auth.clone();
        let account_id = actor.account_id;
        let current_password = current_password.to_string();
        let new_password = new_password.to_string();

        run_blocking(async move {
            let mut tx = pool.begin().await?;
            let mut account = fetch_account_required_for_update(&mut tx, account_id).await?;
            let password_hash = account
                .password_hash
                .as_deref()
                .ok_or(AppError::Unauthorized)?;

            auth.passwords()
                .verify(password_hash, &current_password)
                .map_err(|_| AppError::UnauthorizedCode {
                    code: "current_password_incorrect",
                    message: "current password is incorrect".to_string(),
                })?;

            if auth
                .passwords()
                .verify(password_hash, &new_password)
                .is_ok()
            {
                return Err(AppError::BadRequestCode {
                    code: "password_unchanged",
                    message: "new password must be different from the current password".to_string(),
                });
            }

            let new_password_hash = auth.passwords().hash(&new_password)?;
            let now = Utc::now();
            account.password_hash = Some(new_password_hash.clone());
            account.updated_at = now;

            sqlx::query("update accounts set password_hash = $1, updated_at = $2 where id = $3")
                .bind(&new_password_hash)
                .bind(now)
                .bind(account_id)
                .execute(&mut *tx)
                .await?;

            let revoked_sessions = sqlx::query("delete from auth_sessions where account_id = $1")
                .bind(account_id)
                .execute(&mut *tx)
                .await?
                .rows_affected();

            let session = auth.secrets().issue(SESSION_TOKEN_PREFIX);
            sqlx::query(
                "insert into auth_sessions (token_hash, account_id, expires_at, created_at) values ($1, $2, $3, $4)",
            )
            .bind(session.hash())
            .bind(account_id)
            .bind(now + Duration::days(30))
            .bind(now)
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                "insert into admin_audit_logs (actor_account_id, action, target_type, target_id, metadata, created_at) \
                 values ($1, $2, $3, $4, $5, $6)",
            )
            .bind(account_id)
            .bind("account.password.change")
            .bind("account")
            .bind(account_id.to_string())
            .bind(json!({ "revokedSessions": revoked_sessions }))
            .bind(now)
            .execute(&mut *tx)
            .await?;

            tx.commit().await?;

            Ok(AuthResponse {
                account: account.to_view(),
                token: session.into_value(),
                token_type: "Bearer".to_string(),
            })
        })
    }

    pub fn admin_account(&self, account_id: Uuid) -> AppResult<AccountView> {
        self.profile(account_id)
    }

    pub fn admin_patch_account(
        &self,
        actor: &AuthPrincipal,
        account_id: Uuid,
        patch: AdminAccountPatchRequest,
    ) -> AppResult<AccountView> {
        let pool = self.pool.clone();
        let actor_account_id = actor.account_id;
        run_blocking(async move {
            let mut tx = pool.begin().await?;
            let mut account = fetch_account_required_for_update(&mut tx, account_id).await?;
            if let Some(display_name) = patch.display_name {
                if display_name.trim().is_empty() {
                    return Err(AppError::BadRequest("display name is required".to_string()));
                }
                account.display_name = display_name.trim().to_string();
            }
            if let Some(disabled) = patch.disabled {
                if disabled && account_id == actor_account_id {
                    return Err(AppError::ConflictCode {
                        code: "cannot_disable_current_account",
                        message: "cannot_disable_current_account".to_string(),
                    });
                }
                if disabled {
                    ensure_can_disable_account(&mut tx, &account).await?;
                }
                account.disabled_at = disabled.then(Utc::now);
            }
            account.updated_at = Utc::now();

            sqlx::query(
                "update accounts set display_name = $1, disabled_at = $2, updated_at = $3 where id = $4",
            )
            .bind(&account.display_name)
            .bind(account.disabled_at)
            .bind(account.updated_at)
            .bind(account.id)
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;

            append_audit(
                &pool,
                Some(actor_account_id),
                "account.patch",
                "account",
                Some(account_id.to_string()),
                json!({ "disabled": account.disabled_at.is_some() }),
            )
            .await?;

            Ok(fetch_account_required(&pool, account_id).await?.to_view())
        })
    }

    pub fn admin_devices(&self) -> AppResult<Vec<DeviceView>> {
        let pool = self.pool.clone();
        run_blocking(async move {
            let rows = sqlx::query(
                "select id, account_id, client_device_id, name, remark, token_hash, token_scopes, last_seen_at, last_seen_ip, revoked_at, created_at \
                 from devices order by created_at desc",
            )
            .fetch_all(&pool)
            .await?;
            rows.into_iter()
                .map(row_to_device)
                .map(|result| result.map(|device| device.to_view()))
                .collect()
        })
    }

    pub fn admin_revoke_device(&self, actor: &AuthPrincipal, device_id: Uuid) -> AppResult<()> {
        let pool = self.pool.clone();
        let actor_account_id = actor.account_id;
        run_blocking(async move {
            let result = sqlx::query("update devices set revoked_at = $1 where id = $2")
                .bind(Utc::now())
                .bind(device_id)
                .execute(&pool)
                .await?;
            if result.rows_affected() == 0 {
                return Err(AppError::NotFound("device not found".to_string()));
            }
            append_audit(
                &pool,
                Some(actor_account_id),
                "device.revoke",
                "device",
                Some(device_id.to_string()),
                Value::Object(Default::default()),
            )
            .await?;
            Ok(())
        })
    }

    pub fn admin_config(&self) -> AppResult<crate::model::AdminInstanceConfigView> {
        let pool = self.pool.clone();
        run_blocking(async move { Ok(load_instance_config(&pool).await?.to_admin_view()) })
    }

    pub fn admin_patch_config(
        &self,
        actor: &AuthPrincipal,
        patch: AdminConfigPatchRequest,
    ) -> AppResult<crate::model::AdminInstanceConfigView> {
        let pool = self.pool.clone();
        let actor_account_id = actor.account_id;
        run_blocking(async move {
            let mut config = load_instance_config(&pool).await?;
            if let Some(value) = patch.registration_enabled {
                config.registration_enabled = value;
            }
            if let Some(value) = patch.sms_enabled {
                config.sms_enabled = value;
            }
            if let Some(value) = patch.google_enabled {
                config.google_enabled = value;
            }
            if let Some(value) = patch.wechat_enabled {
                config.wechat_enabled = value;
            }
            if let Some(email) = patch.email {
                if let Some(value) = email.mode {
                    config.email.mode = value;
                }
                if let Some(value) = email.from {
                    let value = value.trim();
                    if value.is_empty() {
                        return Err(AppError::BadRequest("email from is required".to_string()));
                    }
                    config.email.from = value.to_string();
                }
                if let Some(value) = email.smtp_host {
                    config.email.smtp_host = normalize_optional_config_string(value);
                }
                if let Some(value) = email.smtp_port {
                    config.email.smtp_port = value.max(1);
                }
                if let Some(value) = email.smtp_username {
                    config.email.smtp_username = normalize_optional_config_string(value);
                }
                if let Some(value) = email.smtp_password {
                    if !value.trim().is_empty() {
                        config.email.smtp_password = Some(value);
                        config.email.smtp_password_set = true;
                    }
                }
                if let Some(value) = email.code_secret {
                    let value = value.trim();
                    if value.is_empty() {
                        return Err(AppError::BadRequest(
                            "email code secret is required".to_string(),
                        ));
                    }
                    config.email.code_secret = value.to_string();
                }
            }
            validate_email_service_config(&config.email)?;
            if let Some(value) = patch.official_hosted {
                config.official_hosted = value;
            }
            if let Some(value) = patch.max_devices_per_account {
                config.max_devices_per_account = value.max(1);
            }
            if let Some(value) = patch.max_storage_bytes {
                config.max_storage_bytes = value.max(1);
            }

            save_instance_config(&pool, &config).await?;
            let admin_view = config.to_admin_view();
            append_audit(
                &pool,
                Some(actor_account_id),
                "config.patch",
                "instance_config",
                None,
                json!(admin_view),
            )
            .await?;
            Ok(admin_view)
        })
    }

    pub fn admin_roles(&self) -> AppResult<Value> {
        Ok(json!({
            "roles": rbac::ROLES.iter().map(|(code, name)| json!({
                "code": code,
                "name": name,
                "builtIn": true,
                "permissions": rbac::permissions_for_role(code)
            })).collect::<Vec<_>>(),
            "permissions": rbac::PERMISSIONS.iter().map(|(code, description)| json!({ "code": code, "description": description })).collect::<Vec<_>>()
        }))
    }

    pub fn admin_sync_data(&self) -> AppResult<Value> {
        self.sync_data(None)
    }

    pub fn account_sync_data(&self, account_id: Uuid) -> AppResult<Value> {
        self.sync_data(Some(account_id))
    }

    fn sync_data(&self, account_filter: Option<Uuid>) -> AppResult<Value> {
        let pool = self.pool.clone();
        run_blocking(async move {
            let counts = json!({
                "syncSpaces": count_account_rows(&pool, "sync_spaces", account_filter).await?,
                "syncObjects": count_account_rows(&pool, "sync_objects", account_filter).await?,
                "syncEvents": count_account_rows(&pool, "sync_events", account_filter).await?,
                "wrappedVaultKeys": count_account_rows(&pool, "wrapped_vault_keys", account_filter).await?,
                "deviceSyncCursors": count_account_rows(&pool, "device_sync_cursors", account_filter).await?,
                "syncIdempotencyKeys": count_account_rows(&pool, "sync_idempotency_keys", account_filter).await?,
            });

            let sync_spaces = sqlx::query(
                "select s.id, s.account_id, a.display_name as account_name, s.display_name, s.encrypted_metadata, s.created_at, s.updated_at, \
                 (select count(*) from sync_objects o where o.account_id = s.account_id and o.sync_space_id = s.id) as object_count, \
                 (select count(*) from wrapped_vault_keys k where k.account_id = s.account_id and k.sync_space_id = s.id and k.revoked_at is null) as active_wrapped_vault_key_count \
                 from sync_spaces s join accounts a on a.id = s.account_id \
                 where ($1::uuid is null or s.account_id = $1) order by s.updated_at desc limit 100",
            )
            .bind(account_filter)
            .fetch_all(&pool)
            .await?
            .into_iter()
            .map(|row| -> AppResult<Value> {
                let encrypted_metadata: Value = row.try_get("encrypted_metadata")?;
                Ok(json!({
                    "id": row.try_get::<Uuid, _>("id")?,
                    "accountId": row.try_get::<Uuid, _>("account_id")?,
                    "accountName": row.try_get::<String, _>("account_name")?,
                    "displayName": row.try_get::<String, _>("display_name")?,
                    "encryptedMetadataBytes": encrypted_metadata.to_string().len(),
                    "objectCount": row.try_get::<i64, _>("object_count")?,
                    "activeWrappedVaultKeyCount": row.try_get::<i64, _>("active_wrapped_vault_key_count")?,
                    "createdAt": row.try_get::<chrono::DateTime<Utc>, _>("created_at")?,
                    "updatedAt": row.try_get::<chrono::DateTime<Utc>, _>("updated_at")?,
                }))
            })
            .collect::<AppResult<Vec<_>>>()?;

            let sync_object_summaries = sqlx::query(
                "select o.account_id, a.display_name as account_name, s.display_name as sync_space_name, o.sync_space_id, o.object_type, \
                 count(*) as object_count, \
                 count(*) filter (where o.deleted_at is null) as active_count, \
                 count(*) filter (where o.deleted_at is not null) as deleted_count, \
                 coalesce(sum(o.payload_bytes), 0) as payload_bytes, \
                 max(o.revision) as max_revision, \
                 max(o.updated_at) as latest_updated_at \
                   from sync_objects o \
                   join accounts a on a.id = o.account_id \
                   join sync_spaces s on s.account_id = o.account_id and s.id = o.sync_space_id \
                  where ($1::uuid is null or o.account_id = $1) \
                  group by o.account_id, a.display_name, s.display_name, o.sync_space_id, o.object_type \
                  order by latest_updated_at desc, object_count desc",
            )
            .bind(account_filter)
            .fetch_all(&pool)
            .await?
            .into_iter()
            .map(|row| -> AppResult<Value> {
                Ok(json!({
                    "accountId": row.try_get::<Uuid, _>("account_id")?,
                    "accountName": row.try_get::<String, _>("account_name")?,
                    "syncSpaceId": row.try_get::<Uuid, _>("sync_space_id")?,
                    "syncSpaceName": row.try_get::<String, _>("sync_space_name")?,
                    "objectType": row.try_get::<String, _>("object_type")?,
                    "objectCount": row.try_get::<i64, _>("object_count")?,
                    "activeCount": row.try_get::<i64, _>("active_count")?,
                    "deletedCount": row.try_get::<i64, _>("deleted_count")?,
                    "payloadBytes": row.try_get::<i64, _>("payload_bytes")?,
                    "maxRevision": row.try_get::<Option<i64>, _>("max_revision")?.unwrap_or_default(),
                    "latestUpdatedAt": row.try_get::<Option<chrono::DateTime<Utc>>, _>("latest_updated_at")?,
                }))
            })
            .collect::<AppResult<Vec<_>>>()?;

            let sync_objects = sqlx::query(
                "select o.id, o.account_id, a.display_name as account_name, s.display_name as sync_space_name, o.sync_space_id, o.vault_id, o.object_type, o.revision, \
                 o.payload_bytes, o.updated_by_device_id, d.name as updated_by_device_name, o.deleted_at, o.updated_at \
                 from sync_objects o \
                 join accounts a on a.id = o.account_id \
                 join sync_spaces s on s.account_id = o.account_id and s.id = o.sync_space_id \
                 left join devices d on d.id = o.updated_by_device_id \
                   where ($1::uuid is null or o.account_id = $1) order by o.updated_at desc limit 100",
            )
            .bind(account_filter)
            .fetch_all(&pool)
            .await?
            .into_iter()
            .map(|row| -> AppResult<Value> {
                Ok(json!({
                    "id": row.try_get::<Uuid, _>("id")?,
                    "accountId": row.try_get::<Uuid, _>("account_id")?,
                    "accountName": row.try_get::<String, _>("account_name")?,
                    "syncSpaceId": row.try_get::<Uuid, _>("sync_space_id")?,
                    "syncSpaceName": row.try_get::<String, _>("sync_space_name")?,
                    "vaultId": row.try_get::<Uuid, _>("vault_id")?,
                    "objectType": row.try_get::<String, _>("object_type")?,
                    "revision": row.try_get::<i64, _>("revision")?,
                    "payloadBytes": row.try_get::<i32, _>("payload_bytes")?,
                    "updatedByDeviceId": row.try_get::<Uuid, _>("updated_by_device_id")?,
                    "updatedByDeviceName": row.try_get::<Option<String>, _>("updated_by_device_name")?,
                    "deletedAt": row.try_get::<Option<chrono::DateTime<Utc>>, _>("deleted_at")?,
                    "updatedAt": row.try_get::<chrono::DateTime<Utc>, _>("updated_at")?,
                }))
            })
            .collect::<AppResult<Vec<_>>>()?;

            let sync_events = sqlx::query(
                "select e.id, e.account_id, a.display_name as account_name, s.display_name as sync_space_name, e.sync_space_id, e.object_id, e.object_revision, \
                 e.base_revision, e.event_type, length(e.object_snapshot::text) as snapshot_bytes, e.created_at \
                   from sync_events e join accounts a on a.id = e.account_id \
                  join sync_spaces s on s.account_id = e.account_id and s.id = e.sync_space_id \
                   where ($1::uuid is null or e.account_id = $1) order by e.id desc limit 100",
            )
            .bind(account_filter)
            .fetch_all(&pool)
            .await?
            .into_iter()
            .map(|row| -> AppResult<Value> {
                Ok(json!({
                    "id": row.try_get::<i64, _>("id")?,
                    "accountId": row.try_get::<Uuid, _>("account_id")?,
                    "accountName": row.try_get::<String, _>("account_name")?,
                    "syncSpaceId": row.try_get::<Uuid, _>("sync_space_id")?,
                    "syncSpaceName": row.try_get::<String, _>("sync_space_name")?,
                    "objectId": row.try_get::<Uuid, _>("object_id")?,
                    "objectRevision": row.try_get::<i64, _>("object_revision")?,
                    "baseRevision": row.try_get::<i64, _>("base_revision")?,
                    "eventType": row.try_get::<String, _>("event_type")?,
                    "snapshotBytes": row.try_get::<Option<i32>, _>("snapshot_bytes")?.unwrap_or_default(),
                    "createdAt": row.try_get::<chrono::DateTime<Utc>, _>("created_at")?,
                }))
            })
            .collect::<AppResult<Vec<_>>>()?;

            let sync_event_summaries = sqlx::query(
                "select date_trunc('second', e.created_at) as synced_at, e.account_id, a.display_name as account_name, \
                 s.display_name as sync_space_name, e.sync_space_id, \
                 count(*) as event_count, \
                 count(*) filter (where e.event_type = 'created') as created_count, \
                 count(*) filter (where e.event_type = 'updated') as updated_count, \
                 count(*) filter (where e.event_type = 'deleted') as deleted_count, \
                 coalesce(sum(length(e.object_snapshot::text)), 0) as snapshot_bytes, \
                 min(e.id) as first_event_id, \
                 max(e.id) as last_event_id \
                   from sync_events e \
                   join accounts a on a.id = e.account_id \
                   join sync_spaces s on s.account_id = e.account_id and s.id = e.sync_space_id \
                  where ($1::uuid is null or e.account_id = $1) \
                  group by date_trunc('second', e.created_at), e.account_id, a.display_name, s.display_name, e.sync_space_id \
                  order by synced_at desc, last_event_id desc \
                  limit 100",
            )
            .bind(account_filter)
            .fetch_all(&pool)
            .await?
            .into_iter()
            .map(|row| -> AppResult<Value> {
                Ok(json!({
                    "syncedAt": row.try_get::<chrono::DateTime<Utc>, _>("synced_at")?,
                    "accountId": row.try_get::<Uuid, _>("account_id")?,
                    "accountName": row.try_get::<String, _>("account_name")?,
                    "syncSpaceId": row.try_get::<Uuid, _>("sync_space_id")?,
                    "syncSpaceName": row.try_get::<String, _>("sync_space_name")?,
                    "eventCount": row.try_get::<i64, _>("event_count")?,
                    "createdCount": row.try_get::<i64, _>("created_count")?,
                    "updatedCount": row.try_get::<i64, _>("updated_count")?,
                    "deletedCount": row.try_get::<i64, _>("deleted_count")?,
                    "snapshotBytes": row.try_get::<i64, _>("snapshot_bytes")?,
                    "firstEventId": row.try_get::<i64, _>("first_event_id")?,
                    "lastEventId": row.try_get::<i64, _>("last_event_id")?,
                }))
            })
            .collect::<AppResult<Vec<_>>>()?;

            let wrapped_vault_keys = sqlx::query(
                "select k.id, k.account_id, a.display_name as account_name, s.display_name as sync_space_name, k.sync_space_id, k.vault_id, k.key_id, k.wrap_type, \
                 k.generation, length(k.kdf_params::text) as kdf_params_bytes, length(k.wrapped_vault_key::text) as wrapped_vault_key_bytes, \
                 k.created_by_device_id, d.name as created_by_device_name, k.created_at, k.revoked_at \
                   from wrapped_vault_keys k \
                   join accounts a on a.id = k.account_id \
                  join sync_spaces s on s.account_id = k.account_id and s.id = k.sync_space_id \
                   left join devices d on d.id = k.created_by_device_id \
                   where ($1::uuid is null or k.account_id = $1) order by k.created_at desc limit 100",
            )
            .bind(account_filter)
            .fetch_all(&pool)
            .await?
            .into_iter()
            .map(|row| -> AppResult<Value> {
                Ok(json!({
                    "id": row.try_get::<Uuid, _>("id")?,
                    "accountId": row.try_get::<Uuid, _>("account_id")?,
                    "accountName": row.try_get::<String, _>("account_name")?,
                    "syncSpaceId": row.try_get::<Uuid, _>("sync_space_id")?,
                    "syncSpaceName": row.try_get::<String, _>("sync_space_name")?,
                    "vaultId": row.try_get::<Uuid, _>("vault_id")?,
                    "keyId": row.try_get::<String, _>("key_id")?,
                    "wrapType": row.try_get::<String, _>("wrap_type")?,
                    "generation": row.try_get::<i64, _>("generation")?,
                    "kdfParamsBytes": row.try_get::<Option<i32>, _>("kdf_params_bytes")?.unwrap_or_default(),
                    "wrappedVaultKeyBytes": row.try_get::<Option<i32>, _>("wrapped_vault_key_bytes")?.unwrap_or_default(),
                    "createdByDeviceId": row.try_get::<Option<Uuid>, _>("created_by_device_id")?,
                    "createdByDeviceName": row.try_get::<Option<String>, _>("created_by_device_name")?,
                    "createdAt": row.try_get::<chrono::DateTime<Utc>, _>("created_at")?,
                    "revokedAt": row.try_get::<Option<chrono::DateTime<Utc>>, _>("revoked_at")?,
                }))
            })
            .collect::<AppResult<Vec<_>>>()?;

            let device_sync_cursors = sqlx::query(
                "select c.account_id, a.display_name as account_name, c.device_id, d.name as device_name, c.cursor, c.acked_at \
                  from device_sync_cursors c join accounts a on a.id = c.account_id join devices d on d.id = c.device_id \
                  where ($1::uuid is null or c.account_id = $1) order by c.acked_at desc limit 100",
            )
            .bind(account_filter)
            .fetch_all(&pool)
            .await?
            .into_iter()
            .map(|row| -> AppResult<Value> {
                Ok(json!({
                    "accountId": row.try_get::<Uuid, _>("account_id")?,
                    "accountName": row.try_get::<String, _>("account_name")?,
                    "deviceId": row.try_get::<Uuid, _>("device_id")?,
                    "deviceName": row.try_get::<String, _>("device_name")?,
                    "cursor": row.try_get::<i64, _>("cursor")?,
                    "ackedAt": row.try_get::<chrono::DateTime<Utc>, _>("acked_at")?,
                }))
            })
            .collect::<AppResult<Vec<_>>>()?;

            let sync_idempotency_keys = sqlx::query(
                "select k.account_id, a.display_name as account_name, k.device_id, d.name as device_name, k.client_batch_id, \
                 k.client_operation_id, length(k.response::text) as response_bytes, k.created_at \
                  from sync_idempotency_keys k \
                  join accounts a on a.id = k.account_id \
                  join devices d on d.id = k.device_id \
                  where ($1::uuid is null or k.account_id = $1) order by k.created_at desc limit 100",
            )
            .bind(account_filter)
            .fetch_all(&pool)
            .await?
            .into_iter()
            .map(|row| -> AppResult<Value> {
                Ok(json!({
                    "accountId": row.try_get::<Uuid, _>("account_id")?,
                    "accountName": row.try_get::<String, _>("account_name")?,
                    "deviceId": row.try_get::<Uuid, _>("device_id")?,
                    "deviceName": row.try_get::<String, _>("device_name")?,
                    "clientBatchId": row.try_get::<Uuid, _>("client_batch_id")?,
                    "clientOperationId": row.try_get::<Uuid, _>("client_operation_id")?,
                    "responseBytes": row.try_get::<Option<i32>, _>("response_bytes")?.unwrap_or_default(),
                    "createdAt": row.try_get::<chrono::DateTime<Utc>, _>("created_at")?,
                }))
            })
            .collect::<AppResult<Vec<_>>>()?;

            Ok(json!({
                "counts": counts,
                "syncSpaces": sync_spaces,
                "syncObjectSummaries": sync_object_summaries,
                "syncObjects": sync_objects,
                "syncEventSummaries": sync_event_summaries,
                "syncEvents": sync_events,
                "wrappedVaultKeys": wrapped_vault_keys,
                "deviceSyncCursors": device_sync_cursors,
                "syncIdempotencyKeys": sync_idempotency_keys,
            }))
        })
    }

    pub fn admin_grant_role(
        &self,
        actor: &AuthPrincipal,
        account_id: Uuid,
        role: String,
    ) -> AppResult<AccountView> {
        if !rbac::ROLES.iter().any(|(code, _)| *code == role) {
            return Err(AppError::BadRequest("unknown role".to_string()));
        }
        if !actor.roles.iter().any(|role| rbac::can_manage_roles(role)) {
            return Err(AppError::Forbidden);
        }

        let pool = self.pool.clone();
        let actor_account_id = actor.account_id;
        run_blocking(async move {
            let mut tx = pool.begin().await?;
            let account = fetch_account_required_for_update(&mut tx, account_id).await?;
            let role_id = ensure_role(&pool, &role).await?;
            if role == rbac::ROLE_USER {
                ensure_not_removing_current_admin(account_id, actor_account_id)?;
                ensure_can_remove_admin(&mut tx, &account).await?;
            }
            sqlx::query(
                "delete from account_roles using roles \
                 where account_roles.role_id = roles.id and account_roles.account_id = $1",
            )
            .bind(account_id)
            .execute(&mut *tx)
            .await?;
            sqlx::query(
                "insert into account_roles (account_id, role_id, granted_by, created_at) \
                 values ($1, $2, $3::uuid, $4) on conflict (account_id, role_id) do nothing",
            )
            .bind(account_id)
            .bind(role_id)
            .bind(actor_account_id)
            .bind(Utc::now())
            .execute(&mut *tx)
            .await?;
            sqlx::query("update accounts set updated_at = $1 where id = $2")
                .bind(Utc::now())
                .bind(account_id)
                .execute(&mut *tx)
                .await?;
            tx.commit().await?;
            append_audit(
                &pool,
                Some(actor_account_id),
                "role.grant",
                "account",
                Some(account_id.to_string()),
                json!({ "role": role }),
            )
            .await?;
            Ok(fetch_account_required(&pool, account_id).await?.to_view())
        })
    }

    pub fn admin_revoke_role(
        &self,
        actor: &AuthPrincipal,
        account_id: Uuid,
        role: String,
    ) -> AppResult<AccountView> {
        if !actor.roles.iter().any(|role| rbac::can_manage_roles(role)) {
            return Err(AppError::Forbidden);
        }

        let pool = self.pool.clone();
        let actor_account_id = actor.account_id;
        run_blocking(async move {
            let mut tx = pool.begin().await?;
            let account = fetch_account_required_for_update(&mut tx, account_id).await?;
            if role == rbac::ROLE_ADMIN {
                ensure_not_removing_current_admin(account_id, actor_account_id)?;
                ensure_can_remove_admin(&mut tx, &account).await?;
            }

            sqlx::query(
                "delete from account_roles using roles \
                 where account_roles.role_id = roles.id and account_roles.account_id = $1 and roles.code = $2",
            )
            .bind(account_id)
            .bind(&role)
            .execute(&mut *tx)
            .await?;
            sqlx::query("update accounts set updated_at = $1 where id = $2")
                .bind(Utc::now())
                .bind(account_id)
                .execute(&mut *tx)
                .await?;
            tx.commit().await?;
            append_audit(
                &pool,
                Some(actor_account_id),
                "role.revoke",
                "account",
                Some(account_id.to_string()),
                json!({ "role": role }),
            )
            .await?;
            Ok(fetch_account_required(&pool, account_id).await?.to_view())
        })
    }

    pub fn admin_audit_logs(&self) -> AppResult<Vec<AuditLogView>> {
        let pool = self.pool.clone();
        run_blocking(async move {
            let rows = sqlx::query(
                "select id, actor_account_id, action, target_type, target_id, metadata, created_at \
                 from admin_audit_logs order by created_at desc limit 200",
            )
            .fetch_all(&pool)
            .await?;
            rows.into_iter().map(row_to_audit_log).collect()
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
enum SyncOperationOutcome {
    Accepted(SyncPushAccepted),
    Conflict(SyncConflict),
    Rejected(SyncPushRejected),
}

fn ensure_sync_scope(principal: &AuthPrincipal, scope: &str) -> AppResult<Uuid> {
    let device_id = principal.device_id.ok_or(AppError::Forbidden)?;
    if principal.token_scopes.contains(scope) {
        Ok(device_id)
    } else {
        Err(AppError::Forbidden)
    }
}

fn duplicate_sync_object_pairs(objects: &[SyncPushObject]) -> HashSet<(Uuid, Uuid)> {
    let mut counts: HashMap<(Uuid, Uuid), usize> = HashMap::new();
    for object in objects {
        *counts
            .entry((object.sync_space_id, object.object_id))
            .or_insert(0) += 1;
    }
    counts
        .into_iter()
        .filter_map(|(pair, count)| (count > 1).then_some(pair))
        .collect()
}

fn sync_rejected(object: &SyncPushObject, code: &str, message: &str) -> SyncOperationOutcome {
    SyncOperationOutcome::Rejected(SyncPushRejected {
        client_operation_id: object.client_operation_id,
        object_id: object.object_id,
        code: code.to_string(),
        message: message.to_string(),
    })
}

fn append_sync_outcome(
    outcome: SyncOperationOutcome,
    accepted: &mut Vec<SyncPushAccepted>,
    conflicts: &mut Vec<SyncConflict>,
    rejected: &mut Vec<SyncPushRejected>,
) {
    match outcome {
        SyncOperationOutcome::Accepted(value) => accepted.push(value),
        SyncOperationOutcome::Conflict(value) => conflicts.push(value),
        SyncOperationOutcome::Rejected(value) => rejected.push(value),
    }
}

fn sync_payload_bytes(payload: &Value) -> Result<i32, String> {
    let bytes = serde_json::to_vec(payload)
        .map_err(|error| format!("invalid encrypted payload: {error}"))?;
    if bytes.len() > MAX_SYNC_OBJECT_BYTES {
        return Err("encrypted payload exceeds object limit".to_string());
    }
    Ok(bytes.len() as i32)
}

fn sync_batch_payload_bytes(objects: &[SyncPushObject]) -> Result<usize, String> {
    objects.iter().try_fold(0usize, |total, object| {
        let bytes = serde_json::to_vec(&object.encrypted_payload)
            .map_err(|error| format!("invalid encrypted payload: {error}"))?;
        total
            .checked_add(bytes.len())
            .ok_or_else(|| "push payload bytes exceed limit".to_string())
    })
}

fn parse_snapshot_page_token(token: &str) -> AppResult<(i64, i64)> {
    let (offset, cursor) = token
        .split_once(':')
        .ok_or_else(|| AppError::BadRequest("invalid pageToken".to_string()))?;
    let offset = offset
        .parse::<i64>()
        .map_err(|_| AppError::BadRequest("invalid pageToken".to_string()))?;
    let cursor = cursor
        .parse::<i64>()
        .map_err(|_| AppError::BadRequest("invalid pageToken".to_string()))?;
    if offset < 0 || cursor < 0 {
        return Err(AppError::BadRequest("invalid pageToken".to_string()));
    }
    Ok((offset, cursor))
}

async fn sync_space_exists(
    pool: &PgPool,
    account_id: Uuid,
    sync_space_id: Uuid,
) -> AppResult<bool> {
    sqlx::query_scalar("select exists(select 1 from sync_spaces where account_id = $1 and id = $2)")
        .bind(account_id)
        .bind(sync_space_id)
        .fetch_one(pool)
        .await
        .map_err(AppError::from)
}

async fn sync_space_exists_tx(
    tx: &mut Transaction<'_, Postgres>,
    account_id: Uuid,
    sync_space_id: Uuid,
) -> AppResult<bool> {
    sqlx::query_scalar("select exists(select 1 from sync_spaces where account_id = $1 and id = $2)")
        .bind(account_id)
        .bind(sync_space_id)
        .fetch_one(&mut **tx)
        .await
        .map_err(AppError::from)
}

async fn ensure_sync_space_exists(
    pool: &PgPool,
    account_id: Uuid,
    sync_space_id: Uuid,
) -> AppResult<()> {
    if sync_space_exists(pool, account_id, sync_space_id).await? {
        Ok(())
    } else {
        Err(AppError::NotFound("sync space not found".to_string()))
    }
}

async fn claim_idempotency_outcome_tx(
    tx: &mut Transaction<'_, Postgres>,
    account_id: Uuid,
    device_id: Uuid,
    client_batch_id: Uuid,
    object: &SyncPushObject,
) -> AppResult<Option<SyncOperationOutcome>> {
    let placeholder = sync_outcome_json(&sync_rejected(
        object,
        "operation_in_progress",
        "operation is in progress",
    ))?;
    let inserted: Option<Value> = sqlx::query_scalar(
        "insert into sync_idempotency_keys \
         (account_id, device_id, client_batch_id, client_operation_id, response, created_at) \
         values ($1, $2, $3, $4, $5, $6) \
         on conflict (account_id, device_id, client_batch_id, client_operation_id) do nothing \
         returning response",
    )
    .bind(account_id)
    .bind(device_id)
    .bind(client_batch_id)
    .bind(object.client_operation_id)
    .bind(placeholder)
    .bind(Utc::now())
    .fetch_optional(&mut **tx)
    .await?;

    if inserted.is_some() {
        return Ok(None);
    }

    fetch_idempotency_outcome_tx(
        tx,
        account_id,
        device_id,
        client_batch_id,
        object.client_operation_id,
    )
    .await?
    .ok_or_else(|| AppError::Internal("idempotency key conflict without response".to_string()))
    .map(Some)
}

async fn fetch_idempotency_outcome_tx(
    tx: &mut Transaction<'_, Postgres>,
    account_id: Uuid,
    device_id: Uuid,
    client_batch_id: Uuid,
    client_operation_id: Uuid,
) -> AppResult<Option<SyncOperationOutcome>> {
    let value: Option<Value> = sqlx::query_scalar(
        "select response from sync_idempotency_keys \
         where account_id = $1 and device_id = $2 and client_batch_id = $3 and client_operation_id = $4",
    )
    .bind(account_id)
    .bind(device_id)
    .bind(client_batch_id)
    .bind(client_operation_id)
    .fetch_optional(&mut **tx)
    .await?;
    value
        .map(|value| {
            serde_json::from_value(value).map_err(|error| {
                AppError::Internal(format!("invalid sync idempotency response: {error}"))
            })
        })
        .transpose()
}

fn sync_outcome_json(outcome: &SyncOperationOutcome) -> AppResult<Value> {
    serde_json::to_value(outcome)
        .map_err(|error| AppError::Internal(format!("invalid sync outcome: {error}")))
}

async fn save_idempotency_outcome_tx(
    tx: &mut Transaction<'_, Postgres>,
    account_id: Uuid,
    device_id: Uuid,
    client_batch_id: Uuid,
    client_operation_id: Uuid,
    outcome: &SyncOperationOutcome,
) -> AppResult<()> {
    let response = sync_outcome_json(outcome)?;
    sqlx::query(
        "update sync_idempotency_keys \
         set response = $5 \
         where account_id = $1 and device_id = $2 and client_batch_id = $3 and client_operation_id = $4",
    )
    .bind(account_id)
    .bind(device_id)
    .bind(client_batch_id)
    .bind(client_operation_id)
    .bind(response)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

#[derive(Clone)]
struct PostgresEmailAuthStore {
    pool: PgPool,
}

impl EmailAuthStore for PostgresEmailAuthStore {
    type Account = AccountRecord;
    type Error = AppError;

    fn registration_enabled(&self) -> Result<bool, Self::Error> {
        let pool = self.pool.clone();
        run_blocking(async move { Ok(load_instance_config(&pool).await?.registration_enabled) })
    }

    fn email_identity_exists(&self, provider: &str, subject: &str) -> Result<bool, Self::Error> {
        let pool = self.pool.clone();
        let provider = provider.to_string();
        let subject = subject.to_string();
        run_blocking(async move {
            let exists: bool = sqlx::query_scalar(
                "select exists(select 1 from account_identities where provider = $1 and provider_subject = $2)",
            )
            .bind(provider)
            .bind(subject)
            .fetch_one(&pool)
            .await?;
            Ok(exists)
        })
    }

    fn create_email_account(
        &mut self,
        account: NewEmailAccount,
    ) -> Result<Self::Account, Self::Error> {
        let pool = self.pool.clone();
        run_blocking(async move {
            let now = Utc::now();
            let account_id = Uuid::new_v4();
            let account_count: i64 = sqlx::query_scalar("select count(*) from accounts")
                .fetch_one(&pool)
                .await?;
            let role = if account_count == 0 {
                rbac::ROLE_ADMIN
            } else {
                rbac::ROLE_USER
            };
            let role_id = ensure_role(&pool, role).await?;

            sqlx::query(
                "insert into accounts (id, display_name, email, password_hash, created_at, updated_at, disabled_at) \
                 values ($1, $2, $3, $4, $5, $6, $7)",
            )
            .bind(account_id)
            .bind(&account.display_name)
            .bind(&account.subject)
            .bind(&account.password_hash)
            .bind(now)
            .bind(now)
            .bind(Option::<chrono::DateTime<Utc>>::None)
            .execute(&pool)
            .await?;

            sqlx::query(
                "insert into account_identities (id, account_id, provider, provider_subject, display_label, created_at) \
                 values ($1, $2, $3, $4, $5, $6)",
            )
            .bind(Uuid::new_v4())
            .bind(account_id)
            .bind(&account.provider)
            .bind(&account.subject)
            .bind(&account.display_label)
            .bind(now)
            .execute(&pool)
            .await?;

            sqlx::query(
                "insert into account_roles (account_id, role_id, granted_by, created_at) values ($1, $2, $3::uuid, $4)",
            )
            .bind(account_id)
            .bind(role_id)
            .bind(Option::<Uuid>::None)
            .bind(now)
            .execute(&pool)
            .await?;

            fetch_account_required(&pool, account_id).await
        })
    }

    fn find_email_account(
        &self,
        provider: &str,
        subject: &str,
    ) -> Result<Option<StoredEmailAccount<Self::Account>>, Self::Error> {
        let pool = self.pool.clone();
        let provider = provider.to_string();
        let subject = subject.to_string();
        run_blocking(async move {
            let account = fetch_account_by_identity(&pool, &provider, &subject).await?;
            Ok(account.map(|account| StoredEmailAccount {
                password_hash: account.password_hash.clone(),
                disabled: account.disabled_at.is_some(),
                account,
            }))
        })
    }

    fn create_session(
        &mut self,
        account: &Self::Account,
        token_hash: &str,
    ) -> Result<(), Self::Error> {
        let pool = self.pool.clone();
        let account_id = account.id;
        let token_hash = token_hash.to_string();
        run_blocking(async move {
            let now = Utc::now();
            sqlx::query(
                "insert into auth_sessions (token_hash, account_id, expires_at, created_at) values ($1, $2, $3, $4)",
            )
            .bind(token_hash)
            .bind(account_id)
            .bind(now + Duration::days(30))
            .bind(now)
            .execute(&pool)
            .await?;
            Ok(())
        })
    }
}

fn run_blocking<T, F>(future: F) -> AppResult<T>
where
    F: Future<Output = AppResult<T>>,
{
    if let Ok(handle) = tokio::runtime::Handle::try_current() {
        tokio::task::block_in_place(|| handle.block_on(future))
    } else {
        tokio::runtime::Runtime::new()
            .map_err(|error| AppError::Internal(format!("runtime error: {error}")))?
            .block_on(future)
    }
}

async fn seed_rbac(connection: &mut PgConnection) -> AppResult<()> {
    sqlx::query(
        "insert into roles (id, code, name, built_in) values ($1, $2, $3, true) \
         on conflict (code) do update set name = excluded.name, built_in = true",
    )
    .bind(Uuid::new_v4())
    .bind(rbac::ROLE_ADMIN)
    .bind("管理员")
    .execute(&mut *connection)
    .await?;

    sqlx::query(
        "insert into roles (id, code, name, built_in) values ($1, $2, $3, true) \
         on conflict (code) do update set name = excluded.name, built_in = true",
    )
    .bind(Uuid::new_v4())
    .bind(rbac::ROLE_USER)
    .bind("普通用户")
    .execute(&mut *connection)
    .await?;

    sqlx::query(
        "insert into account_roles (account_id, role_id, granted_by, created_at) \
         select distinct ar.account_id, admin_role.id, null::uuid, now() \
         from account_roles ar \
         join roles old_role on old_role.id = ar.role_id \
         join roles admin_role on admin_role.code = $1 \
         where old_role.code in ('owner', 'operator', 'support', 'admin') \
         on conflict (account_id, role_id) do nothing",
    )
    .bind(rbac::ROLE_ADMIN)
    .execute(&mut *connection)
    .await?;

    sqlx::query(
        "insert into account_roles (account_id, role_id, granted_by, created_at) \
         select a.id, user_role.id, null::uuid, now() \
         from accounts a \
         join roles user_role on user_role.code = $1 \
         where not exists (select 1 from account_roles ar where ar.account_id = a.id) \
         on conflict (account_id, role_id) do nothing",
    )
    .bind(rbac::ROLE_USER)
    .execute(&mut *connection)
    .await?;

    sqlx::query(
        "delete from account_roles using roles \
         where account_roles.role_id = roles.id and roles.code not in ($1, $2)",
    )
    .bind(rbac::ROLE_ADMIN)
    .bind(rbac::ROLE_USER)
    .execute(&mut *connection)
    .await?;

    for (code, name) in rbac::ROLES {
        sqlx::query(
            "insert into roles (id, code, name, built_in) values ($1, $2, $3, true) \
             on conflict (code) do update set name = excluded.name, built_in = true",
        )
        .bind(Uuid::new_v4())
        .bind(code)
        .bind(name)
        .execute(&mut *connection)
        .await?;
    }

    for (code, description) in rbac::PERMISSIONS {
        sqlx::query(
            "insert into permissions (id, code, description) values ($1, $2, $3) \
             on conflict (code) do update set description = excluded.description",
        )
        .bind(Uuid::new_v4())
        .bind(code)
        .bind(description)
        .execute(&mut *connection)
        .await?;
    }

    for (role_code, _) in rbac::ROLES {
        sqlx::query(
            "delete from role_permissions using roles \
             where role_permissions.role_id = roles.id and roles.code = $1",
        )
        .bind(role_code)
        .execute(&mut *connection)
        .await?;

        for permission_code in rbac::permissions_for_role(role_code) {
            sqlx::query(
                "insert into role_permissions (role_id, permission_id) \
                 select r.id, p.id from roles r, permissions p where r.code = $1 and p.code = $2 \
                 on conflict (role_id, permission_id) do nothing",
            )
            .bind(role_code)
            .bind(permission_code)
            .execute(&mut *connection)
            .await?;
        }
    }

    sqlx::query(
        "delete from role_permissions using roles \
         where role_permissions.role_id = roles.id and roles.code not in ($1, $2)",
    )
    .bind(rbac::ROLE_ADMIN)
    .bind(rbac::ROLE_USER)
    .execute(&mut *connection)
    .await?;

    sqlx::query("delete from roles where code not in ($1, $2)")
        .bind(rbac::ROLE_ADMIN)
        .bind(rbac::ROLE_USER)
        .execute(&mut *connection)
        .await?;

    Ok(())
}

async fn count_account_rows(
    pool: &PgPool,
    table: &str,
    account_filter: Option<Uuid>,
) -> AppResult<i64> {
    let sql = match table {
        "sync_spaces" => {
            "select count(*) from sync_spaces where ($1::uuid is null or account_id = $1)"
        }
        "sync_objects" => {
            "select count(*) from sync_objects where ($1::uuid is null or account_id = $1)"
        }
        "sync_events" => {
            "select count(*) from sync_events where ($1::uuid is null or account_id = $1)"
        }
        "wrapped_vault_keys" => {
            "select count(*) from wrapped_vault_keys where ($1::uuid is null or account_id = $1)"
        }
        "device_sync_cursors" => {
            "select count(*) from device_sync_cursors where ($1::uuid is null or account_id = $1)"
        }
        "sync_idempotency_keys" => {
            "select count(*) from sync_idempotency_keys where ($1::uuid is null or account_id = $1)"
        }
        _ => {
            return Err(AppError::Internal(format!(
                "unsupported sync data table: {table}"
            )))
        }
    };
    sqlx::query_scalar::<_, i64>(sql)
        .bind(account_filter)
        .fetch_one(pool)
        .await
        .map_err(AppError::from)
}

fn normalize_device_remark(remark: Option<String>) -> Option<String> {
    let value = remark
        .unwrap_or_default()
        .trim()
        .chars()
        .take(80)
        .collect::<String>();

    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn normalize_optional_config_string(value: String) -> Option<String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn validate_email_service_config(config: &EmailServiceConfig) -> AppResult<()> {
    if config.from.trim().is_empty() {
        return Err(AppError::BadRequest("email from is required".to_string()));
    }
    if config.code_secret.trim().is_empty() {
        return Err(AppError::BadRequest(
            "email code secret is required".to_string(),
        ));
    }
    if matches!(config.mode, crate::model::EmailServiceMode::Smtp) {
        if config
            .smtp_host
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            return Err(AppError::BadRequest("SMTP host is required".to_string()));
        }
        if config
            .smtp_username
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            return Err(AppError::BadRequest(
                "SMTP username is required".to_string(),
            ));
        }
        if config
            .smtp_password
            .as_deref()
            .filter(|value| !value.is_empty())
            .is_none()
        {
            return Err(AppError::BadRequest(
                "SMTP password is required".to_string(),
            ));
        }
    }
    Ok(())
}

fn normalize_client_device_id(client_device_id: Option<String>) -> Option<String> {
    let value = client_device_id
        .unwrap_or_default()
        .trim()
        .chars()
        .take(120)
        .collect::<String>();

    if value.is_empty()
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        None
    } else {
        Some(value)
    }
}

async fn ensure_role(pool: &PgPool, code: &str) -> AppResult<Uuid> {
    if let Some(id) = sqlx::query_scalar::<_, Uuid>("select id from roles where code = $1")
        .bind(code)
        .fetch_optional(pool)
        .await?
    {
        return Ok(id);
    }

    let name = rbac::ROLES
        .iter()
        .find(|(role_code, _)| *role_code == code)
        .map(|(_, name)| *name)
        .unwrap_or(code);
    let id = Uuid::new_v4();
    sqlx::query(
        "insert into roles (id, code, name, built_in) values ($1, $2, $3, true) \
         on conflict (code) do nothing",
    )
    .bind(id)
    .bind(code)
    .bind(name)
    .execute(pool)
    .await?;

    sqlx::query_scalar::<_, Uuid>("select id from roles where code = $1")
        .bind(code)
        .fetch_one(pool)
        .await
        .map_err(AppError::from)
}

async fn ensure_role_tx(tx: &mut Transaction<'_, Postgres>, code: &str) -> AppResult<Uuid> {
    if let Some(id) = sqlx::query_scalar::<_, Uuid>("select id from roles where code = $1")
        .bind(code)
        .fetch_optional(&mut **tx)
        .await?
    {
        return Ok(id);
    }

    let name = rbac::ROLES
        .iter()
        .find(|(role_code, _)| *role_code == code)
        .map(|(_, name)| *name)
        .unwrap_or(code);
    let id = Uuid::new_v4();
    sqlx::query(
        "insert into roles (id, code, name, built_in) values ($1, $2, $3, true) \
         on conflict (code) do nothing",
    )
    .bind(id)
    .bind(code)
    .bind(name)
    .execute(&mut **tx)
    .await?;

    sqlx::query_scalar::<_, Uuid>("select id from roles where code = $1")
        .bind(code)
        .fetch_one(&mut **tx)
        .await
        .map_err(AppError::from)
}

async fn load_instance_config(pool: &PgPool) -> AppResult<InstanceConfig> {
    let value = sqlx::query_scalar::<_, Value>("select value from instance_config where key = $1")
        .bind(INSTANCE_CONFIG_KEY)
        .fetch_optional(pool)
        .await?;
    match value {
        Some(value) => serde_json::from_value(value)
            .map_err(|error| AppError::Internal(format!("invalid instance config: {error}"))),
        None => Ok(InstanceConfig::default()),
    }
}

async fn save_instance_config_if_missing(
    connection: &mut PgConnection,
    mut config: InstanceConfig,
) -> AppResult<()> {
    normalize_instance_config_for_storage(&mut config);
    let value = serde_json::to_value(config)
        .map_err(|error| AppError::Internal(format!("invalid instance config: {error}")))?;
    sqlx::query(
        "insert into instance_config (key, value, updated_at) values ($1, $2, $3) \
         on conflict (key) do nothing",
    )
    .bind(INSTANCE_CONFIG_KEY)
    .bind(value)
    .bind(Utc::now())
    .execute(connection)
    .await?;
    Ok(())
}

async fn save_instance_config(pool: &PgPool, config: &InstanceConfig) -> AppResult<()> {
    let mut config = config.clone();
    normalize_instance_config_for_storage(&mut config);
    let value = serde_json::to_value(config)
        .map_err(|error| AppError::Internal(format!("invalid instance config: {error}")))?;
    sqlx::query(
        "insert into instance_config (key, value, updated_at) values ($1, $2, $3) \
         on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(INSTANCE_CONFIG_KEY)
    .bind(value)
    .bind(Utc::now())
    .execute(pool)
    .await?;
    Ok(())
}

fn normalize_instance_config_for_storage(config: &mut InstanceConfig) {
    config.email.smtp_password_set = config.email.smtp_password.is_some();
}

async fn fetch_account_required(pool: &PgPool, account_id: Uuid) -> AppResult<AccountRecord> {
    fetch_account(pool, account_id)
        .await?
        .ok_or(AppError::Unauthorized)
}

async fn fetch_account_required_for_update(
    tx: &mut Transaction<'_, Postgres>,
    account_id: Uuid,
) -> AppResult<AccountRecord> {
    let Some(row) = sqlx::query(
        "select id, display_name, email, password_hash, disabled_at, created_at, updated_at \
         from accounts where id = $1 for update",
    )
    .bind(account_id)
    .fetch_optional(&mut **tx)
    .await?
    else {
        return Err(AppError::Unauthorized);
    };
    let roles = fetch_account_roles_in_tx(tx, account_id).await?;
    Ok(row_to_account(row, roles)?)
}

async fn fetch_account(pool: &PgPool, account_id: Uuid) -> AppResult<Option<AccountRecord>> {
    let Some(row) = sqlx::query(
        "select id, display_name, email, password_hash, disabled_at, created_at, updated_at \
         from accounts where id = $1",
    )
    .bind(account_id)
    .fetch_optional(pool)
    .await?
    else {
        return Ok(None);
    };
    let roles = fetch_account_roles(pool, account_id).await?;
    Ok(Some(row_to_account(row, roles)?))
}

async fn fetch_account_by_identity(
    pool: &PgPool,
    provider: &str,
    subject: &str,
) -> AppResult<Option<AccountRecord>> {
    let Some(row) = sqlx::query(
        "select a.id, a.display_name, a.email, a.password_hash, a.disabled_at, a.created_at, a.updated_at \
         from accounts a join account_identities i on i.account_id = a.id \
         where i.provider = $1 and i.provider_subject = $2",
    )
    .bind(provider)
    .bind(subject)
    .fetch_optional(pool)
    .await?
    else {
        return Ok(None);
    };
    let account_id: Uuid = row.try_get("id")?;
    let roles = fetch_account_roles(pool, account_id).await?;
    Ok(Some(row_to_account(row, roles)?))
}

async fn fetch_account_by_identity_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    provider: &str,
    subject: &str,
) -> AppResult<Option<AccountRecord>> {
    let Some(row) = sqlx::query(
        "select a.id, a.display_name, a.email, a.password_hash, a.disabled_at, a.created_at, a.updated_at \
         from accounts a join account_identities i on i.account_id = a.id \
         where i.provider = $1 and i.provider_subject = $2 for update",
    )
    .bind(provider)
    .bind(subject)
    .fetch_optional(&mut **tx)
    .await?
    else {
        return Ok(None);
    };
    let account_id: Uuid = row.try_get("id")?;
    let roles = fetch_account_roles_in_tx(tx, account_id).await?;
    Ok(Some(row_to_account(row, roles)?))
}

async fn create_email_account_without_password_tx(
    tx: &mut Transaction<'_, Postgres>,
    provider: &str,
    subject: &str,
    display_label: &str,
    display_name: &str,
) -> AppResult<AccountRecord> {
    let now = Utc::now();
    let account_id = Uuid::new_v4();
    let account_count: i64 = sqlx::query_scalar("select count(*) from accounts")
        .fetch_one(&mut **tx)
        .await?;
    let role = if account_count == 0 {
        rbac::ROLE_ADMIN
    } else {
        rbac::ROLE_USER
    };
    let role_id = ensure_role_tx(tx, role).await?;

    sqlx::query(
        "insert into accounts (id, display_name, email, password_hash, created_at, updated_at, disabled_at) \
         values ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(account_id)
    .bind(display_name)
    .bind(subject)
    .bind(Option::<String>::None)
    .bind(now)
    .bind(now)
    .bind(Option::<DateTime<Utc>>::None)
    .execute(&mut **tx)
    .await?;

    sqlx::query(
        "insert into account_identities (id, account_id, provider, provider_subject, display_label, created_at) \
         values ($1, $2, $3, $4, $5, $6)",
    )
    .bind(Uuid::new_v4())
    .bind(account_id)
    .bind(provider)
    .bind(subject)
    .bind(display_label)
    .bind(now)
    .execute(&mut **tx)
    .await?;

    sqlx::query(
        "insert into account_roles (account_id, role_id, granted_by, created_at) values ($1, $2, $3::uuid, $4)",
    )
    .bind(account_id)
    .bind(role_id)
    .bind(Option::<Uuid>::None)
    .bind(now)
    .execute(&mut **tx)
    .await?;

    let roles = fetch_account_roles_in_tx(tx, account_id).await?;
    Ok(AccountRecord {
        id: account_id,
        display_name: display_name.to_string(),
        email: Some(subject.to_string()),
        password_hash: None,
        disabled_at: None,
        created_at: now,
        updated_at: now,
        roles,
    })
}

async fn fetch_account_roles(pool: &PgPool, account_id: Uuid) -> AppResult<BTreeSet<String>> {
    let roles = sqlx::query_scalar::<_, String>(
        "select r.code from roles r join account_roles ar on ar.role_id = r.id where ar.account_id = $1 order by r.code",
    )
    .bind(account_id)
    .fetch_all(pool)
    .await?;
    Ok(roles.into_iter().collect())
}

async fn fetch_account_roles_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    account_id: Uuid,
) -> AppResult<BTreeSet<String>> {
    let roles = sqlx::query_scalar::<_, String>(
        "select r.code from roles r join account_roles ar on ar.role_id = r.id where ar.account_id = $1 order by r.code",
    )
    .bind(account_id)
    .fetch_all(&mut **tx)
    .await?;
    Ok(roles.into_iter().collect())
}

async fn ensure_can_disable_account(
    tx: &mut Transaction<'_, Postgres>,
    account: &AccountRecord,
) -> AppResult<()> {
    if !account.roles.contains(rbac::ROLE_ADMIN) || account.disabled_at.is_some() {
        return Ok(());
    }

    sqlx::query("select pg_advisory_xact_lock(hashtext('lockpass:disable_admin_account'))")
        .execute(&mut **tx)
        .await?;

    let enabled_admin_count: i64 = sqlx::query_scalar(
        "select count(*) \
         from accounts a \
         join account_roles ar on ar.account_id = a.id \
         join roles r on r.id = ar.role_id \
         where r.code = $1 and a.disabled_at is null",
    )
    .bind(rbac::ROLE_ADMIN)
    .fetch_one(&mut **tx)
    .await?;
    if enabled_admin_count <= 1 {
        return Err(AppError::ConflictCode {
            code: "cannot_disable_last_enabled_admin",
            message: "cannot_disable_last_enabled_admin".to_string(),
        });
    }
    Ok(())
}

fn ensure_not_removing_current_admin(account_id: Uuid, actor_account_id: Uuid) -> AppResult<()> {
    if account_id == actor_account_id {
        return Err(AppError::ConflictCode {
            code: "cannot_remove_current_admin_role",
            message: "cannot_remove_current_admin_role".to_string(),
        });
    }
    Ok(())
}

async fn ensure_can_remove_admin(
    tx: &mut Transaction<'_, Postgres>,
    account: &AccountRecord,
) -> AppResult<()> {
    if !account.roles.contains(rbac::ROLE_ADMIN) || account.disabled_at.is_some() {
        return Ok(());
    }

    sqlx::query("select pg_advisory_xact_lock(hashtext('lockpass:disable_admin_account'))")
        .execute(&mut **tx)
        .await?;

    let admin_count: i64 = sqlx::query_scalar(
        "select count(*) \
         from accounts a \
         join account_roles ar on ar.account_id = a.id \
         join roles r on r.id = ar.role_id \
         where r.code = $1 and a.disabled_at is null",
    )
    .bind(rbac::ROLE_ADMIN)
    .fetch_one(&mut **tx)
    .await?;
    if admin_count <= 1 {
        return Err(AppError::ConflictCode {
            code: "cannot_disable_last_enabled_admin",
            message: "cannot_disable_last_enabled_admin".to_string(),
        });
    }
    Ok(())
}

fn row_to_account(row: PgRow, roles: BTreeSet<String>) -> AppResult<AccountRecord> {
    Ok(AccountRecord {
        id: row.try_get("id")?,
        display_name: row.try_get("display_name")?,
        email: row.try_get("email")?,
        password_hash: row.try_get("password_hash")?,
        disabled_at: row.try_get("disabled_at")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
        roles,
    })
}

async fn fetch_device(
    pool: &PgPool,
    account_id: Uuid,
    device_id: Uuid,
) -> AppResult<Option<DeviceRecord>> {
    sqlx::query(
        "select id, account_id, client_device_id, name, remark, token_hash, token_scopes, last_seen_at, last_seen_ip, revoked_at, created_at \
         from devices where id = $1 and account_id = $2",
    )
    .bind(device_id)
    .bind(account_id)
    .fetch_optional(pool)
    .await?
    .map(row_to_device)
    .transpose()
}

async fn create_or_update_device(
    pool: &PgPool,
    auth: &AuthServices,
    account_id: Uuid,
    client_device_id: Option<String>,
    name: String,
    client_ip: Option<String>,
) -> AppResult<(DeviceRecord, String)> {
    let token = auth.secrets().issue(DEVICE_TOKEN_PREFIX);
    let now = Utc::now();
    let token_hash = token.hash().to_string();
    let token_scopes = vec!["sync:read".to_string(), "sync:write".to_string()];

    if let Some(client_device_id) = client_device_id.as_deref() {
        if let Some(row) = sqlx::query(
            "update devices set name = $1, token_hash = $2, token_scopes = $3, last_seen_at = $4, \
             last_seen_ip = coalesce($5, last_seen_ip), revoked_at = null \
             where account_id = $6 and client_device_id = $7 \
             returning id, account_id, client_device_id, name, remark, token_hash, token_scopes, last_seen_at, last_seen_ip, revoked_at, created_at",
        )
        .bind(&name)
        .bind(&token_hash)
        .bind(&token_scopes)
        .bind(now)
        .bind(&client_ip)
        .bind(account_id)
        .bind(client_device_id)
        .fetch_optional(pool)
        .await?
        {
            return Ok((row_to_device(row)?, token.into_value()));
        }
    }

    let config = load_instance_config(pool).await?;
    let active_devices: i64 = sqlx::query_scalar(
        "select count(*) from devices where account_id = $1 and revoked_at is null",
    )
    .bind(account_id)
    .fetch_one(pool)
    .await?;
    if active_devices >= config.max_devices_per_account {
        return Err(AppError::Conflict("device quota exceeded".to_string()));
    }

    let device = DeviceRecord {
        id: Uuid::new_v4(),
        account_id,
        client_device_id,
        name,
        remark: None,
        token_hash,
        token_scopes,
        last_seen_at: Some(now),
        last_seen_ip: client_ip,
        revoked_at: None,
        created_at: now,
    };

    sqlx::query(
        "insert into devices (id, account_id, client_device_id, name, remark, token_hash, token_scopes, last_seen_at, last_seen_ip, revoked_at, created_at) \
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
    )
    .bind(device.id)
    .bind(device.account_id)
    .bind(&device.client_device_id)
    .bind(&device.name)
    .bind(&device.remark)
    .bind(&device.token_hash)
    .bind(&device.token_scopes)
    .bind(device.last_seen_at)
    .bind(&device.last_seen_ip)
    .bind(device.revoked_at)
    .bind(device.created_at)
    .execute(pool)
    .await?;

    Ok((device, token.into_value()))
}

fn row_to_device(row: PgRow) -> AppResult<DeviceRecord> {
    Ok(DeviceRecord {
        id: row.try_get("id")?,
        account_id: row.try_get("account_id")?,
        client_device_id: row.try_get("client_device_id")?,
        name: row.try_get("name")?,
        remark: row.try_get("remark")?,
        token_hash: row.try_get("token_hash")?,
        token_scopes: row.try_get("token_scopes")?,
        last_seen_at: row.try_get("last_seen_at")?,
        last_seen_ip: row.try_get("last_seen_ip")?,
        revoked_at: row.try_get("revoked_at")?,
        created_at: row.try_get("created_at")?,
    })
}

fn normalize_display_name(display_name: Option<String>) -> Option<String> {
    display_name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn normalize_admin_username(username: &str) -> AppResult<String> {
    let username = username.trim();
    if username.is_empty() {
        return Err(AppError::BadRequest("username is required".to_string()));
    }
    if username.len() > 128 {
        return Err(AppError::BadRequest("username is too long".to_string()));
    }
    Ok(username.to_string())
}

fn normalize_email_code(code: &str) -> AppResult<String> {
    let code = code.trim();
    if code.len() == 6 && code.bytes().all(|byte| byte.is_ascii_digit()) {
        Ok(code.to_string())
    } else {
        Err(AppError::BadRequest(
            "email code must be 6 digits".to_string(),
        ))
    }
}

fn generate_email_code(auth: &AuthServices) -> String {
    let raw = auth.secrets().issue("email_code").hash().to_string();
    let mut value: u32 = 0;
    for byte in raw.bytes().take(12) {
        value = value.wrapping_mul(31).wrapping_add(byte as u32);
    }
    format!("{:06}", value % 1_000_000)
}

fn hash_email_code(
    secret: &str,
    challenge_id: Uuid,
    email: &str,
    purpose: EmailChallengePurpose,
    code: &str,
) -> String {
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC accepts keys of any size");
    mac.update(challenge_id.as_bytes());
    mac.update(b"|");
    mac.update(email.as_bytes());
    mac.update(b"|");
    mac.update(purpose.as_str().as_bytes());
    mac.update(b"|");
    mac.update(code.as_bytes());
    hex_encode(&mac.finalize().into_bytes())
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right.iter())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}

fn parse_email_challenge_purpose(value: String) -> AppResult<EmailChallengePurpose> {
    match value.as_str() {
        "register" => Ok(EmailChallengePurpose::Register),
        "login" => Ok(EmailChallengePurpose::Login),
        _ => Err(AppError::Internal(format!(
            "invalid email challenge purpose: {value}"
        ))),
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

async fn fetch_sync_object_for_update(
    tx: &mut Transaction<'_, Postgres>,
    account_id: Uuid,
    sync_space_id: Uuid,
    object_id: Uuid,
) -> AppResult<Option<SyncObjectRecord>> {
    sqlx::query(
        "select id, account_id, sync_space_id, vault_id, object_type, revision, encrypted_payload, \
                payload_bytes, updated_by_device_id, deleted_at, updated_at \
         from sync_objects where account_id = $1 and sync_space_id = $2 and id = $3 for update",
    )
    .bind(account_id)
    .bind(sync_space_id)
    .bind(object_id)
    .fetch_optional(&mut **tx)
    .await?
    .map(row_to_sync_object)
    .transpose()
}

fn row_to_sync_space(row: PgRow) -> AppResult<SyncSpaceRecord> {
    Ok(SyncSpaceRecord {
        id: row.try_get("id")?,
        account_id: row.try_get("account_id")?,
        display_name: row.try_get("display_name")?,
        encrypted_metadata: row.try_get("encrypted_metadata")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn row_to_wrapped_vault_key(row: PgRow) -> AppResult<WrappedVaultKeyRecord> {
    Ok(WrappedVaultKeyRecord {
        id: row.try_get("id")?,
        account_id: row.try_get("account_id")?,
        sync_space_id: row.try_get("sync_space_id")?,
        vault_id: row.try_get("vault_id")?,
        key_id: row.try_get("key_id")?,
        wrap_type: row.try_get("wrap_type")?,
        generation: row.try_get("generation")?,
        kdf_params: row.try_get("kdf_params")?,
        wrapped_vault_key: row.try_get("wrapped_vault_key")?,
        created_by_device_id: row.try_get("created_by_device_id")?,
        created_at: row.try_get("created_at")?,
        revoked_at: row.try_get("revoked_at")?,
    })
}

fn row_to_sync_object(row: PgRow) -> AppResult<SyncObjectRecord> {
    Ok(SyncObjectRecord {
        object_id: row.try_get("id")?,
        account_id: row.try_get("account_id")?,
        sync_space_id: row.try_get("sync_space_id")?,
        vault_id: row.try_get("vault_id")?,
        object_type: row.try_get("object_type")?,
        revision: row.try_get("revision")?,
        encrypted_payload: row.try_get("encrypted_payload")?,
        payload_bytes: row.try_get("payload_bytes")?,
        updated_by_device_id: row.try_get("updated_by_device_id")?,
        deleted_at: row.try_get("deleted_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn row_to_sync_event(row: PgRow) -> AppResult<SyncEventView> {
    let object_value: Value = row.try_get("object_snapshot")?;
    let object: SyncObjectView = serde_json::from_value(object_value)
        .map_err(|error| AppError::Internal(format!("invalid sync event snapshot: {error}")))?;
    Ok(SyncEventView {
        id: row.try_get("id")?,
        sync_space_id: row.try_get("sync_space_id")?,
        event_type: row.try_get("event_type")?,
        object_id: row.try_get("object_id")?,
        object_revision: row.try_get("object_revision")?,
        base_revision: row.try_get("base_revision")?,
        object_snapshot: object,
        created_at: row.try_get("created_at")?,
    })
}

async fn latest_cursor(pool: &PgPool, account_id: Uuid) -> AppResult<i64> {
    let cursor: Option<i64> =
        sqlx::query_scalar("select max(id) from sync_events where account_id = $1")
            .bind(account_id)
            .fetch_one(pool)
            .await?;
    Ok(cursor.unwrap_or(0))
}

fn row_to_identity(row: PgRow) -> AppResult<IdentityRecord> {
    Ok(IdentityRecord {
        id: row.try_get("id")?,
        account_id: row.try_get("account_id")?,
        provider: row.try_get("provider")?,
        provider_subject: row.try_get("provider_subject")?,
        display_label: row.try_get("display_label")?,
        created_at: row.try_get("created_at")?,
    })
}

async fn append_audit(
    pool: &PgPool,
    actor_account_id: Option<Uuid>,
    action: &str,
    target_type: &str,
    target_id: Option<String>,
    metadata: Value,
) -> AppResult<()> {
    sqlx::query(
        "insert into admin_audit_logs (actor_account_id, action, target_type, target_id, metadata, created_at) \
         values ($1, $2, $3, $4, $5, $6)",
    )
    .bind(actor_account_id)
    .bind(action)
    .bind(target_type)
    .bind(target_id)
    .bind(metadata)
    .bind(Utc::now())
    .execute(pool)
    .await?;
    Ok(())
}

fn row_to_audit_log(row: PgRow) -> AppResult<AuditLogView> {
    Ok(AuditLogView {
        id: row.try_get("id")?,
        actor_account_id: row.try_get("actor_account_id")?,
        action: row.try_get("action")?,
        target_type: row.try_get("target_type")?,
        target_id: row.try_get("target_id")?,
        metadata: row.try_get("metadata")?,
        created_at: row.try_get("created_at")?,
    })
}
