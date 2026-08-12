use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct AuthPrincipal {
    pub account_id: Uuid,
    pub device_id: Option<Uuid>,
    pub token_scopes: BTreeSet<String>,
    pub roles: BTreeSet<String>,
}

#[derive(Clone, Debug)]
pub struct AccountRecord {
    pub id: Uuid,
    pub display_name: String,
    pub email: Option<String>,
    pub password_hash: Option<String>,
    pub disabled_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub roles: BTreeSet<String>,
}

impl AccountRecord {
    pub fn to_view(&self) -> AccountView {
        AccountView {
            id: self.id,
            display_name: self.display_name.clone(),
            email: self.email.clone(),
            disabled_at: self.disabled_at,
            created_at: self.created_at,
            updated_at: self.updated_at,
            roles: self.roles.iter().cloned().collect(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountView {
    pub id: Uuid,
    pub display_name: String,
    pub email: Option<String>,
    pub disabled_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub roles: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct IdentityRecord {
    pub id: Uuid,
    pub account_id: Uuid,
    pub provider: String,
    pub provider_subject: String,
    pub display_label: String,
    pub created_at: DateTime<Utc>,
}

impl IdentityRecord {
    pub fn to_view(&self) -> IdentityView {
        IdentityView {
            id: self.id,
            provider: self.provider.clone(),
            provider_subject: self.provider_subject.clone(),
            display_label: self.display_label.clone(),
            created_at: self.created_at,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityView {
    pub id: Uuid,
    pub provider: String,
    pub provider_subject: String,
    pub display_label: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct SessionRecord {
    pub token_hash: String,
    pub account_id: Uuid,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct DeviceRecord {
    pub id: Uuid,
    pub account_id: Uuid,
    pub client_device_id: Option<String>,
    pub name: String,
    pub remark: Option<String>,
    pub token_hash: String,
    pub token_scopes: Vec<String>,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub last_seen_ip: Option<String>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

impl DeviceRecord {
    pub fn to_view(&self) -> DeviceView {
        DeviceView {
            id: self.id,
            account_id: self.account_id,
            client_device_id: self.client_device_id.clone(),
            name: self.name.clone(),
            remark: self.remark.clone(),
            token_scopes: self.token_scopes.clone(),
            last_seen_at: self.last_seen_at,
            last_seen_ip: self.last_seen_ip.clone(),
            revoked_at: self.revoked_at,
            created_at: self.created_at,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceView {
    pub id: Uuid,
    pub account_id: Uuid,
    pub client_device_id: Option<String>,
    pub name: String,
    pub remark: Option<String>,
    pub token_scopes: Vec<String>,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub last_seen_ip: Option<String>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct SyncSpaceRecord {
    pub id: Uuid,
    pub account_id: Uuid,
    pub display_name: String,
    pub encrypted_metadata: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl SyncSpaceRecord {
    pub fn to_view(&self) -> SyncSpaceView {
        SyncSpaceView {
            id: self.id,
            account_id: self.account_id,
            display_name: self.display_name.clone(),
            encrypted_metadata: self.encrypted_metadata.clone(),
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSpaceView {
    pub id: Uuid,
    pub account_id: Uuid,
    pub display_name: String,
    pub encrypted_metadata: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct WrappedVaultKeyRecord {
    pub id: Uuid,
    pub account_id: Uuid,
    pub sync_space_id: Uuid,
    pub vault_id: Uuid,
    pub key_id: String,
    pub wrap_type: String,
    pub generation: i64,
    pub kdf_params: Value,
    pub wrapped_vault_key: Value,
    pub created_by_device_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
}

impl WrappedVaultKeyRecord {
    pub fn to_view(&self) -> WrappedVaultKeyView {
        WrappedVaultKeyView {
            id: self.id,
            sync_space_id: self.sync_space_id,
            vault_id: self.vault_id,
            key_id: self.key_id.clone(),
            wrap_type: self.wrap_type.clone(),
            generation: self.generation,
            kdf_params: self.kdf_params.clone(),
            wrapped_vault_key: self.wrapped_vault_key.clone(),
            created_at: self.created_at,
        }
    }

    pub fn to_metadata_view(&self) -> WrappedVaultKeyMetadataView {
        WrappedVaultKeyMetadataView {
            id: self.id,
            sync_space_id: self.sync_space_id,
            vault_id: self.vault_id,
            key_id: self.key_id.clone(),
            wrap_type: self.wrap_type.clone(),
            generation: self.generation,
            created_at: self.created_at,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedVaultKeyView {
    pub id: Uuid,
    pub sync_space_id: Uuid,
    pub vault_id: Uuid,
    pub key_id: String,
    pub wrap_type: String,
    pub generation: i64,
    pub kdf_params: Value,
    pub wrapped_vault_key: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedVaultKeyMetadataView {
    pub id: Uuid,
    pub sync_space_id: Uuid,
    pub vault_id: Uuid,
    pub key_id: String,
    pub wrap_type: String,
    pub generation: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct SyncObjectRecord {
    pub object_id: Uuid,
    pub account_id: Uuid,
    pub sync_space_id: Uuid,
    pub vault_id: Uuid,
    pub object_type: String,
    pub revision: i64,
    pub encrypted_payload: Value,
    pub payload_bytes: i32,
    pub updated_by_device_id: Uuid,
    pub deleted_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
}

impl SyncObjectRecord {
    pub fn to_view(&self) -> SyncObjectView {
        SyncObjectView {
            object_id: self.object_id,
            sync_space_id: self.sync_space_id,
            vault_id: self.vault_id,
            object_type: self.object_type.clone(),
            revision: self.revision,
            encrypted_payload: self.encrypted_payload.clone(),
            updated_by_device_id: self.updated_by_device_id,
            deleted_at: self.deleted_at,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncObjectView {
    pub object_id: Uuid,
    pub sync_space_id: Uuid,
    pub vault_id: Uuid,
    pub object_type: String,
    pub revision: i64,
    pub encrypted_payload: Value,
    pub updated_by_device_id: Uuid,
    pub deleted_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncEventView {
    pub id: i64,
    pub sync_space_id: Uuid,
    pub event_type: String,
    pub object_id: Uuid,
    pub object_revision: i64,
    pub base_revision: i64,
    pub object_snapshot: SyncObjectView,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogView {
    pub id: i64,
    pub actor_account_id: Option<Uuid>,
    pub action: String,
    pub target_type: String,
    pub target_id: Option<String>,
    pub metadata: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceConfig {
    pub registration_enabled: bool,
    pub sms_enabled: bool,
    pub google_enabled: bool,
    pub wechat_enabled: bool,
    #[serde(default)]
    pub email: EmailServiceConfig,
    pub official_hosted: bool,
    pub max_devices_per_account: i64,
    pub max_storage_bytes: i64,
}

impl Default for InstanceConfig {
    fn default() -> Self {
        Self {
            registration_enabled: true,
            sms_enabled: false,
            google_enabled: false,
            wechat_enabled: false,
            email: EmailServiceConfig::default(),
            official_hosted: false,
            max_devices_per_account: 10,
            max_storage_bytes: 1_073_741_824,
        }
    }
}

impl InstanceConfig {
    pub fn to_admin_view(&self) -> AdminInstanceConfigView {
        AdminInstanceConfigView {
            registration_enabled: self.registration_enabled,
            sms_enabled: self.sms_enabled,
            google_enabled: self.google_enabled,
            wechat_enabled: self.wechat_enabled,
            email: self.email.to_admin_view(),
            official_hosted: self.official_hosted,
            max_devices_per_account: self.max_devices_per_account,
            max_storage_bytes: self.max_storage_bytes,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminInstanceConfigView {
    pub registration_enabled: bool,
    pub sms_enabled: bool,
    pub google_enabled: bool,
    pub wechat_enabled: bool,
    pub email: AdminEmailServiceConfigView,
    pub official_hosted: bool,
    pub max_devices_per_account: i64,
    pub max_storage_bytes: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EmailServiceConfig {
    #[serde(default)]
    pub mode: EmailServiceMode,
    #[serde(default = "default_mailer_from")]
    pub from: String,
    #[serde(default)]
    pub smtp_host: Option<String>,
    #[serde(default = "default_smtp_port")]
    pub smtp_port: u16,
    #[serde(default)]
    pub smtp_username: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub smtp_password: Option<String>,
    #[serde(default)]
    pub smtp_password_set: bool,
    #[serde(default)]
    pub code_secret: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub templates: BTreeMap<String, EmailTemplateOverride>,
}

impl Default for EmailServiceConfig {
    fn default() -> Self {
        Self {
            mode: EmailServiceMode::Log,
            from: default_mailer_from(),
            smtp_host: None,
            smtp_port: default_smtp_port(),
            smtp_username: None,
            smtp_password: None,
            smtp_password_set: false,
            code_secret: String::new(),
            templates: BTreeMap::new(),
        }
    }
}

impl EmailServiceConfig {
    pub fn to_admin_view(&self) -> AdminEmailServiceConfigView {
        AdminEmailServiceConfigView {
            mode: self.mode,
            from: self.from.clone(),
            smtp_host: self.smtp_host.clone(),
            smtp_port: self.smtp_port,
            smtp_username: self.smtp_username.clone(),
            smtp_password_set: self.smtp_password.is_some() || self.smtp_password_set,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminEmailServiceConfigView {
    pub mode: EmailServiceMode,
    pub from: String,
    pub smtp_host: Option<String>,
    pub smtp_port: u16,
    pub smtp_username: Option<String>,
    pub smtp_password_set: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EmailTemplateOverride {
    pub subject: String,
    pub html: String,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailTemplateSummaryView {
    pub id: String,
    pub event: String,
    pub locale: String,
    pub name: String,
    pub subject: String,
    pub is_custom: bool,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailTemplateDetailView {
    pub id: String,
    pub event: String,
    pub locale: String,
    pub name: String,
    pub subject: String,
    pub html: String,
    pub is_custom: bool,
    pub updated_at: Option<DateTime<Utc>>,
    pub placeholders: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailTemplateListResponse {
    pub templates: Vec<EmailTemplateSummaryView>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailTemplatePreviewResponse {
    pub subject: String,
    pub html: String,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EmailServiceMode {
    #[default]
    Log,
    Smtp,
}

fn default_mailer_from() -> String {
    "LockPass <no-reply@lockpass.local>".to_string()
}

fn default_smtp_port() -> u16 {
    587
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailRegisterRequest {
    pub email: String,
    pub password: String,
    pub display_name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailLoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminLoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminPasswordChangeRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailStartRequest {
    pub email: String,
    pub display_name: Option<String>,
    pub purpose: EmailChallengePurpose,
    #[serde(default)]
    pub locale: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EmailChallengePurpose {
    Register,
    Login,
}

impl EmailChallengePurpose {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Register => "register",
            Self::Login => "login",
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailVerifyRequest {
    pub challenge_id: Uuid,
    pub code: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountCompleteRequest {
    pub device_name: String,
    pub client_device_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailStartResponse {
    pub challenge_id: Uuid,
    pub email: String,
    pub expires_at: DateTime<Utc>,
    pub resend_after_seconds: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailVerifyResponse {
    pub account_setup_token: String,
    pub email: String,
    pub display_name: Option<String>,
    pub purpose: EmailChallengePurpose,
    pub expires_at: DateTime<Utc>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceBindRequest {
    pub device_name: String,
    pub client_device_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponse {
    pub account: AccountView,
    pub token: String,
    pub token_type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeResponse {
    pub account: AccountView,
    pub device: Option<DeviceView>,
    pub roles: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceBindResponse {
    pub account: AccountView,
    pub device: DeviceView,
    pub device_token: String,
    pub token_type: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceRemarkPatchRequest {
    pub remark: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSpaceCreateRequest {
    pub display_name: Option<String>,
    pub encrypted_metadata: Option<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSpacesResponse {
    pub sync_spaces: Vec<SyncSpaceView>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSpaceCreateResponse {
    pub sync_space: SyncSpaceView,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedVaultKeyQuery {
    pub sync_space_id: Uuid,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedVaultKeyCreateRequest {
    pub sync_space_id: Uuid,
    pub vault_id: Uuid,
    pub key_id: String,
    pub wrap_type: String,
    pub replaces_wrapped_vault_key_id: Option<Uuid>,
    pub kdf_params: Value,
    pub wrapped_vault_key: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedVaultKeysResponse {
    pub wrapped_vault_keys: Vec<WrappedVaultKeyView>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedVaultKeyCreateResponse {
    pub wrapped_vault_key_record: WrappedVaultKeyMetadataView,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSnapshotQuery {
    pub sync_space_id: Uuid,
    pub page_token: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSnapshotResponse {
    pub sync_space_id: Uuid,
    pub snapshot_cursor: i64,
    pub generated_at: DateTime<Utc>,
    pub wrapped_vault_keys: Vec<WrappedVaultKeyView>,
    pub objects: Vec<SyncObjectView>,
    pub includes_tombstones: bool,
    pub next_page_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPushRequest {
    pub client_batch_id: Uuid,
    pub objects: Vec<SyncPushObject>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPushObject {
    pub client_operation_id: Uuid,
    pub sync_space_id: Uuid,
    pub object_id: Uuid,
    pub vault_id: Uuid,
    pub object_type: String,
    pub base_revision: i64,
    pub revision: i64,
    pub encrypted_payload: Value,
    pub deleted_at: Option<DateTime<Utc>>,
}

impl WrappedVaultKeyCreateRequest {
    pub fn validate_envelope(&self) -> Result<(), String> {
        let aad = validate_encrypted_envelope(&self.wrapped_vault_key, "wrappedVaultKey")?;
        require_aad_string(aad, "purpose", "wrap-vault-key-v1")?;
        require_aad_uuid(aad, "vaultId", self.vault_id)?;
        require_aad_string(aad, "keyId", &self.key_id)?;
        Ok(())
    }
}

impl SyncPushObject {
    pub fn validate_object_type(&self) -> Result<(), String> {
        if matches!(
            self.object_type.as_str(),
            "vault_item" | "vault_attachment" | "vault_metadata"
        ) {
            Ok(())
        } else {
            Err(
                "objectType must be one of vault_item, vault_attachment, vault_metadata"
                    .to_string(),
            )
        }
    }

    pub fn validate_encrypted_payload(&self) -> Result<(), String> {
        let aad = validate_encrypted_envelope(&self.encrypted_payload, "encryptedPayload")?;
        require_aad_string(aad, "purpose", "encrypt-vault-object-v1")?;
        require_aad_uuid(aad, "objectId", self.object_id)?;
        require_aad_uuid(aad, "vaultId", self.vault_id)?;
        require_aad_string(aad, "objectType", &self.object_type)?;
        require_aad_i64(aad, "revision", self.revision)?;
        if let Some(key_id) = aad.get("keyId") {
            require_non_empty_string_value(key_id, "aad.keyId")?;
        }
        Ok(())
    }
}

fn validate_encrypted_envelope<'a>(
    value: &'a Value,
    envelope_name: &str,
) -> Result<&'a serde_json::Map<String, Value>, String> {
    let object = value
        .as_object()
        .ok_or_else(|| format!("{envelope_name} must be an object"))?;

    if object.get("version").and_then(Value::as_u64) != Some(1) {
        return Err(format!("{envelope_name}.version must be 1"));
    }

    let alg = object
        .get("alg")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{envelope_name}.alg must be a string"))?;
    if !matches!(alg, "AES-256-GCM" | "XChaCha20-Poly1305") {
        return Err(format!("{envelope_name}.alg is not supported"));
    }

    require_non_empty_string(object, "keyId", envelope_name)?;
    let nonce = require_non_empty_string(object, "nonce", envelope_name)?;
    let ciphertext = require_non_empty_payload_string(object, "ciphertext", envelope_name)?;
    let tag = require_non_empty_string(object, "tag", envelope_name)?;

    validate_base64url(nonce, &format!("{envelope_name}.nonce"))?;
    validate_base64url(ciphertext, &format!("{envelope_name}.ciphertext"))?;
    validate_base64url(tag, &format!("{envelope_name}.tag"))?;

    let expected_nonce_len = match alg {
        "AES-256-GCM" => 16,
        "XChaCha20-Poly1305" => 32,
        _ => unreachable!(),
    };
    if nonce.len() != expected_nonce_len {
        return Err(format!(
            "{envelope_name}.nonce has invalid length for {alg}"
        ));
    }
    if tag.len() != 22 {
        return Err(format!("{envelope_name}.tag must encode a 16 byte tag"));
    }

    object
        .get("aad")
        .and_then(Value::as_object)
        .ok_or_else(|| format!("{envelope_name}.aad must be an object"))
}

fn require_non_empty_string<'a>(
    object: &'a serde_json::Map<String, Value>,
    field: &str,
    envelope_name: &str,
) -> Result<&'a str, String> {
    let value = object
        .get(field)
        .ok_or_else(|| format!("{envelope_name}.{field} is required"))?;
    require_non_empty_string_value(value, &format!("{envelope_name}.{field}"))
}

fn require_non_empty_payload_string<'a>(
    object: &'a serde_json::Map<String, Value>,
    field: &str,
    envelope_name: &str,
) -> Result<&'a str, String> {
    let value = object
        .get(field)
        .ok_or_else(|| format!("{envelope_name}.{field} is required"))?
        .as_str()
        .ok_or_else(|| format!("{envelope_name}.{field} must be a string"))?;
    if value.trim().is_empty() {
        return Err(format!("{envelope_name}.{field} must not be empty"));
    }
    Ok(value)
}

fn require_non_empty_string_value<'a>(value: &'a Value, field: &str) -> Result<&'a str, String> {
    let value = value
        .as_str()
        .ok_or_else(|| format!("{field} must be a string"))?;
    if value.trim().is_empty() {
        return Err(format!("{field} must not be empty"));
    }
    if value.len() > 512 {
        return Err(format!("{field} is too long"));
    }
    Ok(value)
}

fn validate_base64url(value: &str, field: &str) -> Result<(), String> {
    if value.len() > 1_000_000 {
        return Err(format!("{field} is too long"));
    }
    if value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        Ok(())
    } else {
        Err(format!("{field} must be unpadded base64url"))
    }
}

fn require_aad_string(
    aad: &serde_json::Map<String, Value>,
    field: &str,
    expected: &str,
) -> Result<(), String> {
    let actual = aad
        .get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("aad.{field} must be a string"))?;
    if actual == expected {
        Ok(())
    } else {
        Err(format!("aad.{field} does not match request metadata"))
    }
}

fn require_aad_uuid(
    aad: &serde_json::Map<String, Value>,
    field: &str,
    expected: Uuid,
) -> Result<(), String> {
    require_aad_string(aad, field, &expected.to_string())
}

fn require_aad_i64(
    aad: &serde_json::Map<String, Value>,
    field: &str,
    expected: i64,
) -> Result<(), String> {
    let actual = aad
        .get(field)
        .and_then(Value::as_i64)
        .ok_or_else(|| format!("aad.{field} must be an integer"))?;
    if actual == expected {
        Ok(())
    } else {
        Err(format!("aad.{field} does not match request metadata"))
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPushAccepted {
    pub client_operation_id: Uuid,
    pub object_id: Uuid,
    pub revision: i64,
    pub event_id: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflict {
    pub client_operation_id: Uuid,
    pub object_id: Uuid,
    pub expected_revision: i64,
    pub current_revision: i64,
    pub server_object: Option<SyncObjectView>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPushRejected {
    pub client_operation_id: Uuid,
    pub object_id: Uuid,
    pub code: String,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPushResponse {
    pub accepted: Vec<SyncPushAccepted>,
    pub conflicts: Vec<SyncConflict>,
    pub rejected: Vec<SyncPushRejected>,
    pub next_cursor: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPullQuery {
    pub cursor: Option<i64>,
    pub limit: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPullResponse {
    pub cursor: i64,
    pub next_cursor: i64,
    pub has_more: bool,
    pub events: Vec<SyncEventView>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncAckRequest {
    pub cursor: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilePatchRequest {
    pub display_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageResponse {
    pub devices: usize,
    pub sync_objects: usize,
    pub sync_events: usize,
    pub storage_bytes: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminAccountPatchRequest {
    pub display_name: Option<String>,
    pub disabled: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminConfigPatchRequest {
    pub registration_enabled: Option<bool>,
    pub sms_enabled: Option<bool>,
    pub google_enabled: Option<bool>,
    pub wechat_enabled: Option<bool>,
    pub email: Option<AdminEmailServicePatchRequest>,
    pub official_hosted: Option<bool>,
    pub max_devices_per_account: Option<i64>,
    pub max_storage_bytes: Option<i64>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminEmailServicePatchRequest {
    pub mode: Option<EmailServiceMode>,
    pub from: Option<String>,
    pub smtp_host: Option<String>,
    pub smtp_port: Option<u16>,
    pub smtp_username: Option<String>,
    pub smtp_password: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminEmailTestConnectionRequest {
    #[serde(default)]
    pub email: AdminEmailServicePatchRequest,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminEmailTestSendRequest {
    pub recipient: String,
    pub template_id: String,
    #[serde(default)]
    pub email: AdminEmailServicePatchRequest,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminEmailTemplateUpdateRequest {
    pub subject: String,
    pub html: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminEmailTemplatePreviewRequest {
    pub template_id: String,
    pub subject: String,
    pub html: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminRoleGrantRequest {
    pub role: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub storage: String,
    pub database: String,
    pub started_at: DateTime<Utc>,
}
