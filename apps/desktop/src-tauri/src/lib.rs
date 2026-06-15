use std::fs::{self, File, OpenOptions};
use std::io::{Cursor, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
#[cfg(target_os = "windows")]
use std::ptr;
use std::sync::Mutex;
#[cfg(debug_assertions)]
use std::time::Instant;
use std::time::{SystemTime, UNIX_EPOCH};

use argon2::{Algorithm, Argon2, Params, Version};
use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine as _,
};
use keyring::{Entry, Error as KeyringError};
use rusqlite::{params, types::Type, Connection, OpenFlags, OptionalExtension};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use unicode_normalization::UnicodeNormalization;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::NTE_BAD_KEYSET;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Security::Cryptography::{
    NCryptCreatePersistedKey, NCryptDecrypt, NCryptDeleteKey, NCryptEncrypt, NCryptFinalizeKey,
    NCryptFreeObject, NCryptOpenKey, NCryptOpenStorageProvider, NCryptSetProperty,
    BCRYPT_OAEP_PADDING_INFO, BCRYPT_SHA256_ALGORITHM, MS_KEY_STORAGE_PROVIDER,
    NCRYPT_ALLOW_DECRYPT_FLAG, NCRYPT_KEY_HANDLE, NCRYPT_KEY_USAGE_PROPERTY,
    NCRYPT_LENGTH_PROPERTY, NCRYPT_OVERWRITE_KEY_FLAG, NCRYPT_PAD_OAEP_FLAG, NCRYPT_PROV_HANDLE,
    NCRYPT_RSA_ALGORITHM, NCRYPT_UI_FORCE_HIGH_PROTECTION_FLAG, NCRYPT_UI_POLICY,
    NCRYPT_UI_POLICY_PROPERTY, NCRYPT_UI_PROTECT_KEY_FLAG,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Registry::{
    RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW,
    HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_SZ,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, MOD_SHIFT, MOD_WIN,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::Shell::ShellExecuteW;
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

mod app_meta_migrations {
    use refinery::embed_migrations;
    embed_migrations!("./migrations/app_meta");
}

mod user_vault_migrations {
    use refinery::embed_migrations;
    embed_migrations!("./migrations/user_vault");
}

const RECOVERY_KEY_SERVICE: &str = "lockpass-next";
const DEVICE_UNLOCK_KEY_SERVICE: &str = "lockpass-next-fast-unlock";
const SYNC_DEVICE_TOKEN_SERVICE: &str = "lockpass-next-sync-device-token";
#[cfg(target_os = "windows")]
const WINDOWS_CNG_DEVICE_UNLOCK_PREFIX: &str = "win-cng-v1:";
const UNLOCK_PURPOSE: &str = "lockpass unlock v1";
const KEY_BYTES: usize = 32;
const ARGON2_MAXMEM_BYTES: u64 = 256 * 1024 * 1024;
const RECOVERY_KEY_BYTES: usize = 32;
const RECOVERY_KEY_ALPHABET: &str = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEEP_LINK_SCHEME: &str = "lockpass://";
const DEEP_LINK_EVENT: &str = "lockpass-deep-link";
const DESKTOP_STORE_SCHEMA_VERSION: i64 = 2;
const APP_META_SQLITE_FILE: &str = "app-meta.sqlite";
const USER_VAULT_SQLITE_FILE: &str = "vault.sqlite";

#[derive(Default)]
struct PendingDeepLinks {
    urls: Mutex<Vec<String>>,
}

#[derive(serde::Serialize)]
struct DesktopStatus {
    app_name: &'static str,
    vault_locked: bool,
    sync_connected: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceUnlockCapability {
    supports_passwordless: bool,
    requires_user_presence: bool,
    provider: &'static str,
    reason: &'static str,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct KdfParams {
    version: u32,
    name: String,
    #[serde(rename = "memoryKiB", alias = "memoryKib")]
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
    salt: String,
    key_length_bytes: u32,
    input_encoding: String,
    password_normalization: String,
    purpose: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncryptedObjectRecord {
    object_id: String,
    object_type: String,
    vault_id: String,
    revision: i64,
    base_revision: i64,
    sync_state: String,
    deleted_at: Option<String>,
    updated_at: String,
    key_id: String,
    envelope: serde_json::Value,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncryptedObjectQuery {
    object_type: Option<String>,
    vault_id: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultObjectCount {
    vault_id: String,
    count: i64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LegacyLockPassExport {
    users: Vec<LegacyUserRecord>,
    vaults: Vec<LegacyVaultRecord>,
    vault_items: Vec<LegacyVaultItemRecord>,
    secret_users: Vec<LegacySecretUserRecord>,
    secret_version: Option<i64>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LegacyUserRecord {
    id: i64,
    username: String,
    nickname: Option<String>,
    user_set: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LegacyVaultRecord {
    id: i64,
    name: String,
    user_id: i64,
    icon: Option<String>,
    info: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LegacyVaultItemRecord {
    id: i64,
    user_id: i64,
    vault_id: i64,
    vault_item_type: String,
    icon: String,
    name: String,
    info: Option<String>,
    remarks: Option<String>,
    last_use_time: i64,
    pics: Option<String>,
    create_time: i64,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LegacySecretKeyFile {
    users: Vec<LegacySecretUserRecord>,
    ver: Option<i64>,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LegacySecretUserRecord {
    uid: i64,
    key: String,
    #[serde(alias = "valid_data")]
    valid_data: String,
}

#[tauri::command]
fn desktop_status() -> DesktopStatus {
    DesktopStatus {
        app_name: "LockPass",
        vault_locked: true,
        sync_connected: false,
    }
}

#[tauri::command]
fn lock_vault() -> bool {
    true
}

#[tauri::command]
fn sync_now() -> &'static str {
    "sync_server_not_configured"
}

#[tauri::command]
fn system_locale() -> Option<String> {
    sys_locale::get_locale()
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err("external URL must start with http:// or https://".to_string());
    }

    open_system_target(trimmed, "external URL")
}

#[tauri::command]
fn get_app_data_dir(app: AppHandle) -> Result<String, String> {
    let path = app_data_dir(&app)?;
    fs::create_dir_all(&path)
        .map_err(|error| format!("failed to create app data directory: {error}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_app_data_dir(app: AppHandle) -> Result<String, String> {
    let path = app_data_dir(&app)?;
    fs::create_dir_all(&path)
        .map_err(|error| format!("failed to create app data directory: {error}"))?;
    let path_text = path.to_string_lossy().to_string();
    open_system_target(&path_text, "app data directory")?;
    Ok(path_text)
}

#[tauri::command]
fn save_text_file_to_downloads(app: AppHandle, file_name: String, text: String) -> Result<String, String> {
    let file_name = safe_output_file_name(&file_name)?;
    let downloads_dir = app
        .path()
        .download_dir()
        .map_err(|error| format!("failed to resolve downloads directory: {error}"))?;
    fs::create_dir_all(&downloads_dir)
        .map_err(|error| format!("failed to create downloads directory: {error}"))?;
    let path = unique_output_path(downloads_dir.join(file_name));
    fs::write(&path, text).map_err(|error| format!("failed to save file: {error}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_file_parent_dir(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    let parent = path
        .parent()
        .ok_or_else(|| "file path has no parent directory".to_string())?;
    let parent_text = parent.to_string_lossy().to_string();
    open_system_target(&parent_text, "file parent directory")
}

#[tauri::command]
fn open_log_dir(app: AppHandle) -> Result<String, String> {
    let path = log_dir(&app)?;
    fs::create_dir_all(&path).map_err(|error| format!("failed to create log directory: {error}"))?;
    let path_text = path.to_string_lossy().to_string();
    open_system_target(&path_text, "log directory")?;
    Ok(path_text)
}

#[tauri::command]
fn write_desktop_log(app: AppHandle, level: String, message: String) -> Result<(), String> {
    let level = normalize_log_level(&level)?;
    let message = normalize_log_message(&message)?;
    let path = log_dir(&app)?;
    fs::create_dir_all(&path).map_err(|error| format!("failed to create log directory: {error}"))?;
    let log_path = path.join("lockpass.log");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| format!("failed to open desktop log file: {error}"))?;
    writeln!(file, "{} [{}] {}", current_timestamp_string(), level, message)
        .map_err(|error| format!("failed to write desktop log file: {error}"))?;
    Ok(())
}

#[tauri::command]
fn read_desktop_log(app: AppHandle, max_bytes: Option<u64>) -> Result<String, String> {
    let log_path = log_dir(&app)?.join("lockpass.log");
    if !log_path.exists() {
        return Ok(String::new());
    }

    let mut file = File::open(&log_path)
        .map_err(|error| format!("failed to open desktop log file: {error}"))?;
    let file_len = file
        .metadata()
        .map_err(|error| format!("failed to read desktop log metadata: {error}"))?
        .len();
    let max_bytes = max_bytes.unwrap_or(256 * 1024).max(1);
    let start = file_len.saturating_sub(max_bytes);
    file.seek(SeekFrom::Start(start))
        .map_err(|error| format!("failed to seek desktop log file: {error}"))?;

    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|error| format!("failed to read desktop log file: {error}"))?;
    let mut text = String::from_utf8_lossy(&bytes).to_string();
    if start > 0 {
        if let Some(index) = text.find('\n') {
            text = text[index + 1..].to_string();
        }
        text.insert_str(0, "...\n");
    }
    Ok(text)
}

#[tauri::command]
fn check_global_shortcut(shortcut: String) -> Result<&'static str, String> {
    #[cfg(target_os = "windows")]
    {
        let (modifiers, key_code) = parse_windows_hotkey(&shortcut)?;
        let hotkey_id = 0x4c50;
        let registered = unsafe { RegisterHotKey(std::ptr::null_mut(), hotkey_id, modifiers, key_code) };
        if registered == 0 {
            return Ok("unavailable");
        }
        unsafe {
            UnregisterHotKey(std::ptr::null_mut(), hotkey_id);
        }
        return Ok("available");
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = shortcut;
        Ok("unsupported")
    }
}

#[tauri::command]
fn load_start_on_login() -> Result<Option<bool>, String> {
    #[cfg(target_os = "windows")]
    {
        return windows_start_on_login_enabled().map(Some);
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

#[tauri::command]
fn set_start_on_login(enabled: bool) -> Result<Option<bool>, String> {
    #[cfg(target_os = "windows")]
    {
        windows_set_start_on_login(enabled)?;
        return Ok(Some(windows_start_on_login_enabled()?));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = enabled;
        Ok(None)
    }
}

fn normalize_log_level(level: &str) -> Result<&'static str, String> {
    match level {
        "error" => Ok("ERROR"),
        "info" => Ok("INFO"),
        "debug" => Ok("DEBUG"),
        _ => Err("invalid desktop log level".to_string()),
    }
}

fn normalize_log_message(message: &str) -> Result<String, String> {
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err("desktop log message is required".to_string());
    }
    Ok(trimmed
        .chars()
        .map(|character| match character {
            '\r' | '\n' | '\t' => ' ',
            character if character.is_control() => ' ',
            character => character,
        })
        .take(4_000)
        .collect())
}

#[cfg(target_os = "windows")]
fn parse_windows_hotkey(shortcut: &str) -> Result<(u32, u32), String> {
    let mut modifiers = MOD_NOREPEAT;
    let mut key_code = None;

    for token in shortcut.split('+').map(str::trim).filter(|token| !token.is_empty()) {
        match token.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => modifiers |= MOD_CONTROL,
            "alt" => modifiers |= MOD_ALT,
            "shift" => modifiers |= MOD_SHIFT,
            "win" | "windows" | "meta" | "cmd" | "command" => modifiers |= MOD_WIN,
            key => key_code = Some(windows_hotkey_code(key)?),
        }
    }

    key_code
        .map(|code| (modifiers, code))
        .ok_or_else(|| "global shortcut key is required".to_string())
}

#[cfg(target_os = "windows")]
fn windows_hotkey_code(key: &str) -> Result<u32, String> {
    let key = key.to_ascii_uppercase();
    if key.len() == 1 {
        let byte = key.as_bytes()[0];
        if byte.is_ascii_alphanumeric() {
            return Ok(byte as u32);
        }
    }
    if let Some(number) = key.strip_prefix('F').and_then(|value| value.parse::<u32>().ok()) {
        if (1..=24).contains(&number) {
            return Ok(0x70 + number - 1);
        }
    }
    match key.as_str() {
        "UP" | "ARROWUP" => Ok(0x26),
        "DOWN" | "ARROWDOWN" => Ok(0x28),
        "LEFT" | "ARROWLEFT" => Ok(0x25),
        "RIGHT" | "ARROWRIGHT" => Ok(0x27),
        "SPACE" => Ok(0x20),
        "TAB" => Ok(0x09),
        "ENTER" => Ok(0x0D),
        "ESC" | "ESCAPE" => Ok(0x1B),
        "BACKSPACE" => Ok(0x08),
        "DELETE" => Ok(0x2E),
        "INSERT" => Ok(0x2D),
        "HOME" => Ok(0x24),
        "END" => Ok(0x23),
        "PAGEUP" => Ok(0x21),
        "PAGEDOWN" => Ok(0x22),
        "," => Ok(0xBC),
        "." => Ok(0xBE),
        "/" => Ok(0xBF),
        ";" => Ok(0xBA),
        "'" => Ok(0xDE),
        "[" => Ok(0xDB),
        "]" => Ok(0xDD),
        "\\" => Ok(0xDC),
        "-" => Ok(0xBD),
        "=" => Ok(0xBB),
        _ => Err(format!("unsupported global shortcut key: {key}")),
    }
}

#[cfg(target_os = "windows")]
fn windows_start_on_login_enabled() -> Result<bool, String> {
    let key = windows_open_run_key(KEY_READ)?;
    let value_name = wide_null("LockPass");
    let mut value_type = 0;
    let mut byte_len = 0;
    let status = unsafe {
        RegQueryValueExW(
            key,
            value_name.as_ptr(),
            std::ptr::null(),
            &mut value_type,
            std::ptr::null_mut(),
            &mut byte_len,
        )
    };
    unsafe {
        RegCloseKey(key);
    }

    if status == windows_sys::Win32::Foundation::ERROR_FILE_NOT_FOUND {
        return Ok(false);
    }
    if status != windows_sys::Win32::Foundation::ERROR_SUCCESS {
        return Err(format!("failed to read start-on-login registry value: {status}"));
    }
    Ok(value_type == REG_SZ && byte_len > 0)
}

#[cfg(target_os = "windows")]
fn windows_set_start_on_login(enabled: bool) -> Result<(), String> {
    let key = windows_open_run_key(KEY_WRITE)?;
    let value_name = wide_null("LockPass");
    let status = if enabled {
        let current_exe = std::env::current_exe()
            .map_err(|error| format!("failed to resolve current executable: {error}"))?;
        let value = wide_null(&format!("\"{}\"", current_exe.to_string_lossy()));
        let bytes = unsafe {
            std::slice::from_raw_parts(value.as_ptr() as *const u8, value.len() * std::mem::size_of::<u16>())
        };
        unsafe { RegSetValueExW(key, value_name.as_ptr(), 0, REG_SZ, bytes.as_ptr(), bytes.len() as u32) }
    } else {
        unsafe { RegDeleteValueW(key, value_name.as_ptr()) }
    };
    unsafe {
        RegCloseKey(key);
    }

    if !enabled && status == windows_sys::Win32::Foundation::ERROR_FILE_NOT_FOUND {
        return Ok(());
    }
    if status != windows_sys::Win32::Foundation::ERROR_SUCCESS {
        return Err(format!("failed to update start-on-login registry value: {status}"));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn windows_open_run_key(access: u32) -> Result<windows_sys::Win32::System::Registry::HKEY, String> {
    let subkey = wide_null("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
    let mut key = std::ptr::null_mut();
    let status = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            0,
            access,
            &mut key,
        )
    };
    if status != windows_sys::Win32::Foundation::ERROR_SUCCESS {
        return Err(format!("failed to open start-on-login registry key: {status}"));
    }
    Ok(key)
}

fn safe_output_file_name(file_name: &str) -> Result<&str, String> {
    let trimmed = file_name.trim();
    if trimmed.is_empty() {
        return Err("file name is required".to_string());
    }
    if trimmed.len() > 180 {
        return Err("file name is too long".to_string());
    }
    if Path::new(trimmed)
        .file_name()
        .and_then(|value| value.to_str())
        != Some(trimmed)
    {
        return Err("file name must not contain a path".to_string());
    }
    Ok(trimmed)
}

fn unique_output_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }

    let parent = path.parent().map(Path::to_path_buf).unwrap_or_default();
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("lockpass-export");
    let extension = path.extension().and_then(|value| value.to_str());

    for index in 1..1000 {
        let file_name = match extension {
            Some(extension) if !extension.is_empty() => format!("{stem} ({index}).{extension}"),
            _ => format!("{stem} ({index})"),
        };
        let candidate = parent.join(file_name);
        if !candidate.exists() {
            return candidate;
        }
    }

    path
}

fn open_system_target(target: &str, label: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let operation = wide_null("open");
        let target = wide_null(target);
        let result = unsafe {
            ShellExecuteW(
                ptr::null_mut(),
                operation.as_ptr(),
                target.as_ptr(),
                ptr::null(),
                ptr::null(),
                SW_SHOWNORMAL,
            )
        };
        if result as isize <= 32 {
            return Err(format!(
                "failed to open {label}: ShellExecuteW returned {result:?}"
            ));
        }
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(target)
            .spawn()
            .map_err(|error| format!("failed to open {label}: {error}"))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|error| format!("failed to open {label}: {error}"))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err(format!("opening {label} is not supported on this platform"))
}

#[cfg(target_os = "windows")]
fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[tauri::command]
fn take_pending_deep_links(app: AppHandle) -> Vec<String> {
    let Some(pending) = app.try_state::<PendingDeepLinks>() else {
        return Vec::new();
    };

    let urls = match pending.urls.lock() {
        Ok(mut urls) => std::mem::take(&mut *urls),
        Err(_) => Vec::new(),
    };
    urls
}

#[tauri::command]
fn device_unlock_capability() -> DeviceUnlockCapability {
    #[cfg(target_os = "windows")]
    {
        return DeviceUnlockCapability {
            supports_passwordless: true,
            requires_user_presence: true,
            provider: "windows-cng-user-presence",
            reason: "available",
        };
    }

    #[cfg(not(target_os = "windows"))]
    DeviceUnlockCapability {
        supports_passwordless: false,
        requires_user_presence: false,
        provider: "unsupported",
        reason: "platform_user_presence_unavailable",
    }
}

#[tauri::command]
async fn derive_unlock_key_argon2id(
    password: String,
    recovery_key: String,
    params: KdfParams,
) -> Result<String, String> {
    #[cfg(debug_assertions)]
    let perf_start = Instant::now();

    tauri::async_runtime::spawn_blocking(move || {
        derive_unlock_key_argon2id_inner(password, recovery_key, params)
    })
    .await
    .map_err(|error| format!("failed to join Argon2id KDF task: {error}"))?
    .map(|derived| {
        #[cfg(debug_assertions)]
        eprintln!(
            "[perf-rust-json] {{\"name\":\"derive_unlock_key_argon2id\",\"totalMs\":{:.1}}}",
            perf_start.elapsed().as_secs_f64() * 1000.0
        );

        derived
    })
}

fn derive_unlock_key_argon2id_inner(
    password: String,
    recovery_key: String,
    params: KdfParams,
) -> Result<String, String> {
    assert_supported_kdf(&params)?;

    let input = encode_unlock_input(&password, &recovery_key)?;
    let salt = base64url_to_bytes(&params.salt)?;
    validate_argon2_runtime_params(&params, &salt)?;
    let argon_params = Params::new(
        params.memory_kib,
        params.iterations,
        params.parallelism,
        Some(KEY_BYTES),
    )
    .map_err(|error| format!("failed to configure Argon2id KDF: {error}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon_params);
    let mut output = [0u8; KEY_BYTES];

    argon2
        .hash_password_into(&input, &salt, &mut output)
        .map_err(|error| format!("failed to derive unlock key: {error}"))?;

    Ok(bytes_to_base64url(&output))
}

#[tauri::command]
fn save_recovery_key(user_id: String, recovery_key: String) -> Result<(), String> {
    #[cfg(debug_assertions)]
    let perf_start = Instant::now();

    if user_id.trim().is_empty() {
        return Err("user_id is required".to_string());
    }
    if recovery_key.trim().is_empty() {
        return Err("recovery_key is required".to_string());
    }

    let result = recovery_key_entry(&user_id)?
        .set_password(&recovery_key)
        .map_err(|error| format!("failed to save recovery key: {error}"));

    #[cfg(debug_assertions)]
    eprintln!(
        "[perf-rust-json] {{\"name\":\"save_recovery_key\",\"totalMs\":{:.1},\"ok\":{}}}",
        perf_start.elapsed().as_secs_f64() * 1000.0,
        result.is_ok()
    );

    result
}

#[tauri::command]
fn load_recovery_key(user_id: String) -> Result<Option<String>, String> {
    #[cfg(debug_assertions)]
    let perf_start = Instant::now();

    if user_id.trim().is_empty() {
        return Err("user_id is required".to_string());
    }

    let result = match recovery_key_entry(&user_id)?.get_password() {
        Ok(recovery_key) => Ok(Some(recovery_key)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(format!("failed to load recovery key: {error}")),
    };

    #[cfg(debug_assertions)]
    eprintln!(
        "[perf-rust-json] {{\"name\":\"load_recovery_key\",\"totalMs\":{:.1},\"ok\":{},\"status\":\"{}\"}}",
        perf_start.elapsed().as_secs_f64() * 1000.0,
        result.is_ok(),
        match &result {
            Ok(Some(_)) => "loaded",
            Ok(None) => "missing",
            Err(_) => "failed",
        }
    );

    result
}

#[tauri::command]
fn delete_recovery_key(user_id: String) -> Result<(), String> {
    if user_id.trim().is_empty() {
        return Err("user_id is required".to_string());
    }

    match recovery_key_entry(&user_id)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(format!("failed to delete recovery key: {error}")),
    }
}

#[tauri::command]
fn save_device_unlock_key(
    account_id: String,
    user_id: String,
    device_id: String,
    device_key_id: String,
    device_unlock_key: String,
) -> Result<(), String> {
    if account_id.trim().is_empty() {
        return Err("account_id is required".to_string());
    }
    if user_id.trim().is_empty() {
        return Err("user_id is required".to_string());
    }
    if device_id.trim().is_empty() {
        return Err("device_id is required".to_string());
    }
    if device_key_id.trim().is_empty() {
        return Err("device_key_id is required".to_string());
    }
    if device_unlock_key.trim().is_empty() {
        return Err("device_unlock_key is required".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        return save_device_unlock_key_windows(
            &account_id,
            &user_id,
            &device_id,
            &device_key_id,
            &device_unlock_key,
        );
    }

    #[cfg(not(target_os = "windows"))]
    device_unlock_key_entry(&account_id, &user_id, &device_id, &device_key_id)?
        .set_password(&device_unlock_key)
        .map_err(|error| format!("failed to save device unlock key: {error}"))
}

#[tauri::command]
fn load_device_unlock_key(
    account_id: String,
    user_id: String,
    device_id: String,
    device_key_id: String,
) -> Result<Option<String>, String> {
    if account_id.trim().is_empty() {
        return Err("account_id is required".to_string());
    }
    if user_id.trim().is_empty() {
        return Err("user_id is required".to_string());
    }
    if device_id.trim().is_empty() {
        return Err("device_id is required".to_string());
    }
    if device_key_id.trim().is_empty() {
        return Err("device_key_id is required".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        return load_device_unlock_key_windows(&account_id, &user_id, &device_id, &device_key_id);
    }

    #[cfg(not(target_os = "windows"))]
    match device_unlock_key_entry(&account_id, &user_id, &device_id, &device_key_id)?.get_password()
    {
        Ok(device_unlock_key) => Ok(Some(device_unlock_key)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(format!("failed to load device unlock key: {error}")),
    }
}

#[tauri::command]
fn delete_device_unlock_key(
    account_id: String,
    user_id: String,
    device_id: String,
    device_key_id: String,
) -> Result<(), String> {
    if account_id.trim().is_empty() {
        return Err("account_id is required".to_string());
    }
    if user_id.trim().is_empty() {
        return Err("user_id is required".to_string());
    }
    if device_id.trim().is_empty() {
        return Err("device_id is required".to_string());
    }
    if device_key_id.trim().is_empty() {
        return Err("device_key_id is required".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        return delete_device_unlock_key_windows(&account_id, &user_id, &device_id, &device_key_id);
    }

    #[cfg(not(target_os = "windows"))]
    match device_unlock_key_entry(&account_id, &user_id, &device_id, &device_key_id)?
        .delete_credential()
    {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(format!("failed to delete device unlock key: {error}")),
    }
}

#[tauri::command]
fn save_sync_device_token(user_id: String, token: String) -> Result<(), String> {
    if user_id.trim().is_empty() {
        return Err("user_id is required".to_string());
    }
    if token.trim().is_empty() {
        return Err("token is required".to_string());
    }

    sync_device_token_entry(&user_id)?
        .set_password(&token)
        .map_err(|error| format!("failed to save sync device token: {error}"))
}

#[tauri::command]
fn load_sync_device_token(user_id: String) -> Result<Option<String>, String> {
    if user_id.trim().is_empty() {
        return Err("user_id is required".to_string());
    }

    match sync_device_token_entry(&user_id)?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(format!("failed to load sync device token: {error}")),
    }
}

#[tauri::command]
fn delete_sync_device_token(user_id: String) -> Result<(), String> {
    if user_id.trim().is_empty() {
        return Err("user_id is required".to_string());
    }

    match sync_device_token_entry(&user_id)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(format!("failed to delete sync device token: {error}")),
    }
}

#[tauri::command]
fn load_vault_store(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    reset_legacy_store_if_needed(&app)?;

    if !app_meta_path(&app)?.exists() {
        return Ok(None);
    }

    let conn = open_app_meta_connection(&app)?;
    let settings = load_app_settings(&conn)?;
    let users = load_user_profiles(&app, &conn)?;
    Ok(Some(build_vault_store(settings, users)))
}

#[tauri::command]
fn save_vault_store(app: AppHandle, data: serde_json::Value) -> Result<(), String> {
    validate_vault_store(&data)?;
    reset_legacy_store_if_needed(&app)?;

    fs::create_dir_all(users_dir(&app)?)
        .map_err(|error| format!("failed to create users directory: {error}"))?;

    let users = data
        .get("users")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "vault store users must be an array".to_string())?;
    let mut user_ids = Vec::with_capacity(users.len());
    for user in users {
        let user_id = required_string_field(user, "id")?;
        validate_path_segment(user_id, "user id")?;
        user_ids.push(user_id.to_string());
        save_user_profile(&app, user)?;
    }

    let mut conn = open_app_meta_connection(&app)?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("failed to start app metadata transaction: {error}"))?;
    save_app_settings(&tx, &data)?;
    tx.execute("delete from users", [])
        .map_err(|error| format!("failed to clear users metadata: {error}"))?;
    for user in users {
        let user_id = required_string_field(user, "id")?;
        let username = string_field(user, "username");
        let display_name = string_field(user, "displayName");
        let created_at = string_field(user, "createdAt");
        let updated_at = string_field(user, "updatedAt");
        let vault_db_path = format!("users/{user_id}/{USER_VAULT_SQLITE_FILE}");
        tx.execute(
            "insert into users (id, username, display_name, created_at, updated_at, vault_db_path)
             values (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                user_id,
                username,
                display_name,
                created_at,
                updated_at,
                vault_db_path
            ],
        )
        .map_err(|error| format!("failed to save user metadata: {error}"))?;
    }
    tx.commit()
        .map_err(|error| format!("failed to commit app metadata: {error}"))?;

    cleanup_removed_user_dirs(&app, &user_ids)?;
    Ok(())
}

#[tauri::command]
fn load_encrypted_objects(
    app: AppHandle,
    user_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    load_encrypted_objects_with_query(app, user_id, None)
}

#[tauri::command]
fn query_encrypted_objects(
    app: AppHandle,
    user_id: String,
    query: EncryptedObjectQuery,
) -> Result<Vec<serde_json::Value>, String> {
    load_encrypted_objects_with_query(app, user_id, Some(query))
}

#[tauri::command]
fn count_encrypted_objects_by_vault(
    app: AppHandle,
    user_id: String,
    object_type: String,
) -> Result<Vec<VaultObjectCount>, String> {
    validate_path_segment(&user_id, "user id")?;
    validate_encrypted_object_type(&object_type)?;
    let path = user_vault_path(&app, &user_id)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let conn = open_user_vault_connection(&app, &user_id)?;
    let mut stmt = conn
        .prepare(
            "select vault_id, count(*)
             from encrypted_objects
             where object_type = ?1 and deleted_at is null
             group by vault_id",
        )
        .map_err(|error| format!("failed to prepare encrypted object count query: {error}"))?;
    let rows = stmt
        .query_map(params![object_type], |row| {
            Ok(VaultObjectCount {
                vault_id: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|error| format!("failed to count encrypted objects: {error}"))?;

    let mut counts = Vec::new();
    for row in rows {
        counts
            .push(row.map_err(|error| format!("failed to read encrypted object count: {error}"))?);
    }
    Ok(counts)
}

fn load_encrypted_objects_with_query(
    app: AppHandle,
    user_id: String,
    query: Option<EncryptedObjectQuery>,
) -> Result<Vec<serde_json::Value>, String> {
    validate_path_segment(&user_id, "user id")?;
    let path = user_vault_path(&app, &user_id)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let object_type = query
        .as_ref()
        .and_then(|query| query.object_type.as_deref());
    if let Some(object_type) = object_type {
        validate_encrypted_object_type(object_type)?;
    }
    let vault_id = query.as_ref().and_then(|query| query.vault_id.as_deref());
    if let Some(vault_id) = vault_id {
        validate_path_segment(vault_id, "vault id")?;
    }

    let conn = open_user_vault_connection(&app, &user_id)?;
    let mut stmt = conn
        .prepare(
            "select object_id, object_type, vault_id, revision, base_revision, sync_state,
                    deleted_at, updated_at, key_id, envelope_json
             from encrypted_objects
             where (?1 is null or object_type = ?1)
               and (?2 is null or vault_id = ?2)
             order by updated_at, object_id",
        )
        .map_err(|error| format!("failed to prepare encrypted objects query: {error}"))?;
    let rows = stmt
        .query_map(params![object_type, vault_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
            ))
        })
        .map_err(|error| format!("failed to load encrypted objects: {error}"))?;

    let mut objects = Vec::new();
    for row in rows {
        let (
            object_id,
            object_type,
            vault_id,
            revision,
            base_revision,
            sync_state,
            deleted_at,
            updated_at,
            key_id,
            envelope_json,
        ) = row.map_err(|error| format!("failed to read encrypted object: {error}"))?;
        let envelope: serde_json::Value = serde_json::from_str(&envelope_json)
            .map_err(|error| format!("failed to parse encrypted object envelope: {error}"))?;
        objects.push(serde_json::json!({
            "objectId": object_id,
            "objectType": object_type,
            "vaultId": vault_id,
            "revision": revision,
            "baseRevision": base_revision,
            "syncState": sync_state,
            "deletedAt": deleted_at,
            "updatedAt": updated_at,
            "keyId": key_id,
            "envelope": envelope
        }));
    }

    Ok(objects)
}

#[tauri::command]
fn save_encrypted_objects(
    app: AppHandle,
    user_id: String,
    records: Vec<EncryptedObjectRecord>,
) -> Result<(), String> {
    validate_path_segment(&user_id, "user id")?;
    let mut conn = open_user_vault_connection(&app, &user_id)?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("failed to start encrypted objects transaction: {error}"))?;

    tx.execute("delete from encrypted_objects", [])
        .map_err(|error| format!("failed to clear encrypted objects: {error}"))?;

    for record in records {
        validate_encrypted_object_record(&record)?;
        let envelope_json = serde_json::to_string(&record.envelope)
            .map_err(|error| format!("failed to serialize encrypted object envelope: {error}"))?;
        tx.execute(
            "insert into encrypted_objects (
               object_id, object_type, vault_id, revision, base_revision, sync_state,
               deleted_at, updated_at, key_id, envelope_json
             ) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                record.object_id,
                record.object_type,
                record.vault_id,
                record.revision,
                record.base_revision,
                record.sync_state,
                record.deleted_at,
                record.updated_at,
                record.key_id,
                envelope_json
            ],
        )
        .map_err(|error| format!("failed to save encrypted object: {error}"))?;
    }

    tx.commit()
        .map_err(|error| format!("failed to commit encrypted objects: {error}"))?;
    Ok(())
}

#[tauri::command]
fn upsert_encrypted_objects(
    app: AppHandle,
    user_id: String,
    records: Vec<EncryptedObjectRecord>,
) -> Result<(), String> {
    validate_path_segment(&user_id, "user id")?;
    let mut conn = open_user_vault_connection(&app, &user_id)?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("failed to start encrypted objects transaction: {error}"))?;

    for record in records {
        validate_encrypted_object_record(&record)?;
        let envelope_json = serde_json::to_string(&record.envelope)
            .map_err(|error| format!("failed to serialize encrypted object envelope: {error}"))?;
        tx.execute(
            "insert into encrypted_objects (
               object_id, object_type, vault_id, revision, base_revision, sync_state,
               deleted_at, updated_at, key_id, envelope_json
             ) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             on conflict(object_id) do update set
               object_type = excluded.object_type,
               vault_id = excluded.vault_id,
               revision = excluded.revision,
               base_revision = excluded.base_revision,
               sync_state = excluded.sync_state,
               deleted_at = excluded.deleted_at,
               updated_at = excluded.updated_at,
               key_id = excluded.key_id,
               envelope_json = excluded.envelope_json",
            params![
                record.object_id,
                record.object_type,
                record.vault_id,
                record.revision,
                record.base_revision,
                record.sync_state,
                record.deleted_at,
                record.updated_at,
                record.key_id,
                envelope_json
            ],
        )
        .map_err(|error| format!("failed to upsert encrypted object: {error}"))?;
    }

    tx.commit()
        .map_err(|error| format!("failed to commit encrypted objects: {error}"))?;
    Ok(())
}

#[tauri::command]
fn save_attachment_blob(
    app: AppHandle,
    user_id: String,
    attachment_id: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    validate_path_segment(&user_id, "user id")?;
    validate_attachment_envelope(&bytes)?;

    let attachment_dir = user_attachment_dir(&app, &user_id)?;
    fs::create_dir_all(&attachment_dir)
        .map_err(|error| format!("failed to create attachment directory: {error}"))?;

    let stored_name = attachment_file_name(&attachment_id, &file_name)?;
    let path = attachment_dir.join(&stored_name);
    fs::write(&path, bytes).map_err(|error| format!("failed to write attachment: {error}"))?;

    Ok(format!("local://users/{user_id}/attachments/{stored_name}"))
}

#[tauri::command]
fn load_attachment_blob(app: AppHandle, encrypted_blob_ref: String) -> Result<Vec<u8>, String> {
    let path = attachment_blob_path(&app, &encrypted_blob_ref)?;
    fs::read(&path).map_err(|error| format!("failed to read attachment: {error}"))
}

#[tauri::command]
fn delete_attachment_blob(app: AppHandle, encrypted_blob_ref: String) -> Result<(), String> {
    let path = attachment_blob_path(&app, &encrypted_blob_ref)?;

    if !path.exists() {
        return Ok(());
    }

    fs::remove_file(&path).map_err(|error| format!("failed to delete attachment: {error}"))
}

#[tauri::command]
fn read_legacy_lockpass_backup(backup_bytes: Vec<u8>) -> Result<LegacyLockPassExport, String> {
    let (db_bytes, secret_key_json) = extract_legacy_backup_files(&backup_bytes)?;
    read_legacy_lockpass_db_inner(&db_bytes, &secret_key_json)
}

fn read_legacy_lockpass_db_inner(
    db_bytes: &[u8],
    secret_key_json: &str,
) -> Result<LegacyLockPassExport, String> {
    if db_bytes.is_empty() {
        return Err("legacy lockpass.db is empty".to_string());
    }

    let secret_key = parse_legacy_secret_key(secret_key_json)?;
    let (conn, db_path) = open_legacy_db_from_bytes(db_bytes)?;
    let export_result = (|| {
        validate_legacy_schema(&conn)?;
        Ok(LegacyLockPassExport {
            users: read_legacy_users(&conn)?,
            vaults: read_legacy_vaults(&conn)?,
            vault_items: read_legacy_vault_items(&conn)?,
            secret_users: secret_key.users,
            secret_version: secret_key.ver,
        })
    })();
    drop(conn);
    let remove_result = fs::remove_file(&db_path)
        .map_err(|error| format!("failed to remove legacy SQLite temp file: {error}"));

    match (export_result, remove_result) {
        (Ok(export), Ok(())) => Ok(export),
        (Err(error), Ok(())) => Err(error),
        (Ok(_), Err(remove_error)) => Err(remove_error),
        (Err(error), Err(remove_error)) => Err(format!("{error}; {remove_error}")),
    }
}

fn extract_legacy_backup_files(backup_bytes: &[u8]) -> Result<(Vec<u8>, String), String> {
    if backup_bytes.is_empty() {
        return Err("legacy backup zip is empty".to_string());
    }

    let reader = Cursor::new(backup_bytes);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|error| format!("failed to read legacy backup zip: {error}"))?;
    let db_bytes = read_zip_file_by_name(&mut archive, "lockpass.db")?;
    let secret_key_bytes = read_zip_file_by_name(&mut archive, "secret.key")?;
    let secret_key_json = String::from_utf8(secret_key_bytes)
        .map_err(|error| format!("legacy secret.key must be UTF-8 JSON: {error}"))?;

    Ok((db_bytes, secret_key_json))
}

fn read_zip_file_by_name(
    archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    expected_name: &str,
) -> Result<Vec<u8>, String> {
    let mut entry_index = None;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("failed to inspect legacy backup zip entry: {error}"))?;
        if zip_entry_file_name(entry.name()) == expected_name {
            entry_index = Some(index);
            break;
        }
    }

    let index =
        entry_index.ok_or_else(|| format!("legacy backup zip is missing {expected_name}"))?;
    let mut entry = archive.by_index(index).map_err(|error| {
        format!("failed to open {expected_name} from legacy backup zip: {error}")
    })?;
    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes).map_err(|error| {
        format!("failed to read {expected_name} from legacy backup zip: {error}")
    })?;
    Ok(bytes)
}

fn zip_entry_file_name(name: &str) -> &str {
    name.rsplit(['/', '\\']).next().unwrap_or(name)
}

fn open_legacy_db_from_bytes(db_bytes: &[u8]) -> Result<(Connection, PathBuf), String> {
    let mut path = std::env::temp_dir();
    path.push(format!(
        "lockpass-legacy-import-{}-{}-{}.db",
        std::process::id(),
        current_timestamp_string(),
        legacy_temp_nonce()
    ));

    fs::write(&path, db_bytes)
        .map_err(|error| format!("failed to write legacy SQLite temp file: {error}"))?;
    match Connection::open_with_flags(
        &path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_PRIVATE_CACHE,
    ) {
        Ok(conn) => Ok((conn, path)),
        Err(error) => {
            let remove_result = fs::remove_file(&path);
            match remove_result {
                Ok(()) => Err(format!("failed to open legacy lockpass.db: {error}")),
                Err(remove_error) => Err(format!(
                    "failed to open legacy lockpass.db: {error}; additionally failed to remove legacy SQLite temp file: {remove_error}"
                )),
            }
        }
    }
}

fn legacy_temp_nonce() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default()
}

fn parse_legacy_secret_key(secret_key_json: &str) -> Result<LegacySecretKeyFile, String> {
    let secret_key: LegacySecretKeyFile = serde_json::from_str(secret_key_json)
        .map_err(|error| format!("failed to parse legacy secret.key JSON: {error}"))?;
    if secret_key.users.is_empty() {
        return Err("legacy secret.key JSON contains no users".to_string());
    }

    for user in &secret_key.users {
        if user.key.trim().is_empty() {
            return Err(format!(
                "legacy secret.key user {} is missing key",
                user.uid
            ));
        }
        if user.valid_data.trim().is_empty() {
            return Err(format!(
                "legacy secret.key user {} is missing valid_data",
                user.uid
            ));
        }
    }

    Ok(secret_key)
}

fn validate_legacy_schema(conn: &Connection) -> Result<(), String> {
    for (table, columns) in [
        ("user", &["id", "username", "nickname", "user_set"][..]),
        ("vault", &["id", "name", "user_id", "icon", "info"][..]),
        (
            "vault_item",
            &[
                "id",
                "user_id",
                "vault_id",
                "vault_item_type",
                "icon",
                "name",
                "info",
                "remarks",
                "last_use_time",
                "pics",
                "create_time",
            ][..],
        ),
    ] {
        validate_legacy_table_columns(conn, table, columns)?;
    }

    Ok(())
}

fn validate_legacy_table_columns(
    conn: &Connection,
    table_name: &str,
    required_columns: &[&str],
) -> Result<(), String> {
    let escaped_table_name = table_name.replace('\'', "''");
    let exists: i64 = conn
        .query_row(
            "select count(*) from sqlite_master where type = 'table' and name = ?1",
            [table_name],
            |row| row.get(0),
        )
        .map_err(|error| format!("failed to inspect legacy table {table_name}: {error}"))?;
    if exists == 0 {
        return Err(format!("legacy lockpass.db is missing table {table_name}"));
    }

    let mut stmt = conn
        .prepare(&format!("pragma table_info('{escaped_table_name}')"))
        .map_err(|error| format!("failed to inspect legacy table {table_name}: {error}"))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("failed to read legacy table {table_name} columns: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read legacy table {table_name} column: {error}"))?;

    let missing_columns = required_columns
        .iter()
        .filter(|column| !columns.iter().any(|existing| existing == **column))
        .copied()
        .collect::<Vec<_>>();
    if !missing_columns.is_empty() {
        return Err(format!(
            "legacy table {table_name} is missing columns: {}",
            missing_columns.join(", ")
        ));
    }

    Ok(())
}

fn read_legacy_users(conn: &Connection) -> Result<Vec<LegacyUserRecord>, String> {
    let mut stmt = conn
        .prepare("select id, username, nickname, user_set from user order by id")
        .map_err(|error| format!("failed to prepare legacy user query: {error}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(LegacyUserRecord {
                id: row.get(0)?,
                username: row.get(1)?,
                nickname: row.get(2)?,
                user_set: row.get(3)?,
            })
        })
        .map_err(|error| format!("failed to load legacy users: {error}"))?;

    collect_legacy_rows(rows, "user")
}

fn read_legacy_vaults(conn: &Connection) -> Result<Vec<LegacyVaultRecord>, String> {
    let mut stmt = conn
        .prepare("select id, name, user_id, icon, info from vault order by id")
        .map_err(|error| format!("failed to prepare legacy vault query: {error}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(LegacyVaultRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                user_id: row.get(2)?,
                icon: row.get(3)?,
                info: row.get(4)?,
            })
        })
        .map_err(|error| format!("failed to load legacy vaults: {error}"))?;

    collect_legacy_rows(rows, "vault")
}

fn read_legacy_vault_items(conn: &Connection) -> Result<Vec<LegacyVaultItemRecord>, String> {
    let mut stmt = conn
        .prepare(
            "select id, user_id, vault_id, vault_item_type, icon, name, info, remarks,
                    last_use_time, pics, create_time
             from vault_item
             order by id",
        )
        .map_err(|error| format!("failed to prepare legacy vault_item query: {error}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(LegacyVaultItemRecord {
                id: row.get(0)?,
                user_id: row.get(1)?,
                vault_id: row.get(2)?,
                vault_item_type: row.get(3)?,
                icon: row.get(4)?,
                name: row.get(5)?,
                info: row.get(6)?,
                remarks: row.get(7)?,
                last_use_time: row.get(8)?,
                pics: row.get(9)?,
                create_time: row.get(10)?,
            })
        })
        .map_err(|error| format!("failed to load legacy vault items: {error}"))?;

    collect_legacy_rows(rows, "vault_item")
}

fn collect_legacy_rows<T>(
    rows: rusqlite::MappedRows<'_, impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>>,
    table_name: &str,
) -> Result<Vec<T>, String> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row.map_err(|error| format_legacy_row_error(table_name, error))?);
    }
    Ok(records)
}

fn format_legacy_row_error(table_name: &str, error: rusqlite::Error) -> String {
    match error {
        rusqlite::Error::InvalidColumnName(column) => {
            format!("legacy table {table_name} is missing column {column}")
        }
        rusqlite::Error::InvalidColumnType(index, column, actual_type) => format!(
            "legacy table {table_name} column {} has unexpected type {} at index {index}",
            column,
            sqlite_type_name(actual_type)
        ),
        other => format!("failed to read legacy table {table_name}: {other}"),
    }
}

fn sqlite_type_name(value_type: Type) -> &'static str {
    match value_type {
        Type::Null => "null",
        Type::Integer => "integer",
        Type::Real => "real",
        Type::Text => "text",
        Type::Blob => "blob",
    }
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data directory: {error}"))
}

fn app_meta_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(APP_META_SQLITE_FILE))
}

fn users_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("users"))
}

fn log_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("logs"))
}

fn user_dir(app: &AppHandle, user_id: &str) -> Result<PathBuf, String> {
    validate_path_segment(user_id, "user id")?;
    Ok(users_dir(app)?.join(user_id))
}

fn user_vault_path(app: &AppHandle, user_id: &str) -> Result<PathBuf, String> {
    Ok(user_dir(app, user_id)?.join(USER_VAULT_SQLITE_FILE))
}

fn user_attachment_dir(app: &AppHandle, user_id: &str) -> Result<PathBuf, String> {
    Ok(user_dir(app, user_id)?.join("attachments"))
}

fn open_app_meta_connection(app: &AppHandle) -> Result<Connection, String> {
    let path = app_meta_path(app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "app metadata path has no parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("failed to create app data directory: {error}"))?;

    let conn = Connection::open(&path)
        .map_err(|error| format!("failed to open app metadata sqlite: {error}"))?;
    configure_sqlite_connection(&conn, true)?;
    migrate_app_meta_schema(conn)
}

fn open_user_vault_connection(app: &AppHandle, user_id: &str) -> Result<Connection, String> {
    let path = user_vault_path(app, user_id)?;
    let parent = path
        .parent()
        .ok_or_else(|| "user vault path has no parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("failed to create user data directory: {error}"))?;

    let conn = Connection::open(&path)
        .map_err(|error| format!("failed to open user vault sqlite: {error}"))?;
    configure_sqlite_connection(&conn, true)?;
    migrate_user_vault_schema(conn)
}

fn configure_sqlite_connection(conn: &Connection, enable_wal: bool) -> Result<(), String> {
    conn.execute_batch("pragma foreign_keys = on;")
        .map_err(|error| format!("failed to enable sqlite foreign keys: {error}"))?;
    if enable_wal {
        conn.execute_batch("pragma journal_mode = wal;")
            .map_err(|error| format!("failed to enable sqlite wal mode: {error}"))?;
    }
    Ok(())
}

fn migrate_app_meta_schema(mut conn: Connection) -> Result<Connection, String> {
    app_meta_migrations::migrations::runner()
        .run(&mut conn)
        .map_err(|error| format!("failed to migrate app metadata sqlite: {error}"))?;
    Ok(conn)
}

fn migrate_user_vault_schema(mut conn: Connection) -> Result<Connection, String> {
    user_vault_migrations::migrations::runner()
        .run(&mut conn)
        .map_err(|error| format!("failed to migrate user vault sqlite: {error}"))?;
    Ok(conn)
}

struct AppSettingsSnapshot {
    active_user_id: serde_json::Value,
    locale: serde_json::Value,
    device_id: serde_json::Value,
    layout: serde_json::Value,
    logging: serde_json::Value,
    shortcuts: serde_json::Value,
    security: serde_json::Value,
}

fn load_app_settings(conn: &Connection) -> Result<AppSettingsSnapshot, String> {
    Ok(AppSettingsSnapshot {
        active_user_id: load_setting(conn, "activeUserId")?.unwrap_or(serde_json::Value::Null),
        locale: load_setting(conn, "locale")?
            .unwrap_or_else(|| serde_json::Value::String("zh-CN".to_string())),
        device_id: load_setting(conn, "deviceId")?
            .unwrap_or_else(|| serde_json::Value::String(String::new())),
        layout: load_setting(conn, "layout")?.unwrap_or_else(|| serde_json::json!({})),
        logging: load_setting(conn, "logging")?
            .unwrap_or_else(|| serde_json::json!({ "level": "error" })),
        shortcuts: load_setting(conn, "shortcuts")?.unwrap_or_else(|| serde_json::json!({})),
        security: load_setting(conn, "security")?.unwrap_or_else(|| serde_json::json!({})),
    })
}

fn load_setting(conn: &Connection, key: &str) -> Result<Option<serde_json::Value>, String> {
    let raw = conn
        .query_row(
            "select value_json from app_settings where key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("failed to load app setting {key}: {error}"))?;

    raw.map(|value| {
        serde_json::from_str(&value)
            .map_err(|error| format!("failed to parse app setting {key}: {error}"))
    })
    .transpose()
}

fn save_app_settings(conn: &Connection, data: &serde_json::Value) -> Result<(), String> {
    let settings = data.get("settings").unwrap_or(&serde_json::Value::Null);
    let storage_version =
        serde_json::Value::Number(serde_json::Number::from(DESKTOP_STORE_SCHEMA_VERSION));
    let entries = [
        (
            "activeUserId",
            data.get("activeUserId").unwrap_or(&serde_json::Value::Null),
        ),
        (
            "locale",
            settings.get("locale").unwrap_or(&serde_json::Value::Null),
        ),
        (
            "deviceId",
            settings.get("deviceId").unwrap_or(&serde_json::Value::Null),
        ),
        (
            "layout",
            settings.get("layout").unwrap_or(&serde_json::Value::Null),
        ),
        (
            "logging",
            settings.get("logging").unwrap_or(&serde_json::Value::Null),
        ),
        (
            "shortcuts",
            settings.get("shortcuts").unwrap_or(&serde_json::Value::Null),
        ),
        (
            "security",
            settings.get("security").unwrap_or(&serde_json::Value::Null),
        ),
        ("storageVersion", &storage_version),
    ];
    let now = current_timestamp_string();

    for (key, value) in entries {
        let value_json = serde_json::to_string(value)
            .map_err(|error| format!("failed to serialize app setting {key}: {error}"))?;
        conn.execute(
            "insert into app_settings (key, value_json, updated_at)
             values (?1, ?2, ?3)
             on conflict(key) do update set value_json = excluded.value_json, updated_at = excluded.updated_at",
            params![key, value_json, now],
        )
        .map_err(|error| format!("failed to save app setting {key}: {error}"))?;
    }

    Ok(())
}

fn load_user_profiles(
    app: &AppHandle,
    conn: &Connection,
) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn
        .prepare("select id, username, display_name, created_at, updated_at from users order by created_at, id")
        .map_err(|error| format!("failed to prepare user metadata query: {error}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|error| format!("failed to load users metadata: {error}"))?;

    let mut users = Vec::new();
    for row in rows {
        let (user_id, username, display_name, created_at, updated_at) =
            row.map_err(|error| format!("failed to read user metadata: {error}"))?;
        validate_path_segment(&user_id, "user id")?;
        let crypto = load_user_crypto(app, &user_id)?;
        let sync = load_user_sync_settings(app, &user_id)?;
        let profile = serde_json::json!({
            "id": user_id,
            "username": username,
            "displayName": display_name,
            "createdAt": created_at,
            "updatedAt": updated_at,
            "sync": sync,
            "crypto": crypto
        });
        users.push(profile);
    }

    Ok(users)
}

fn load_user_crypto(app: &AppHandle, user_id: &str) -> Result<serde_json::Value, String> {
    let path = user_vault_path(app, user_id)?;
    if !path.exists() {
        return Ok(serde_json::Value::Null);
    }

    let conn = open_user_vault_connection(app, user_id)?;
    let raw = conn
        .query_row(
            "select crypto_json from user_crypto where id = ?1",
            params![user_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("failed to load user crypto: {error}"))?;

    match raw {
        Some(value) => serde_json::from_str(&value)
            .map_err(|error| format!("failed to parse user crypto: {error}")),
        None => Ok(serde_json::Value::Null),
    }
}

fn save_user_profile(app: &AppHandle, user: &serde_json::Value) -> Result<(), String> {
    let user_id = required_string_field(user, "id")?;
    let conn = open_user_vault_connection(app, user_id)?;
    let updated_at = string_field(user, "updatedAt");

    save_user_crypto(
        &conn,
        user_id,
        user.get("crypto").unwrap_or(&serde_json::Value::Null),
        &updated_at,
    )?;
    save_user_sync_settings(
        &conn,
        user.get("sync").unwrap_or(&serde_json::Value::Null),
        &updated_at,
    )?;
    Ok(())
}

fn save_user_crypto(
    conn: &Connection,
    user_id: &str,
    crypto: &serde_json::Value,
    updated_at: &str,
) -> Result<(), String> {
    if crypto.is_null() {
        conn.execute("delete from user_crypto where id = ?1", params![user_id])
            .map_err(|error| format!("failed to clear user crypto: {error}"))?;
        return Ok(());
    }

    let crypto = strip_legacy_encrypted_payload(crypto);
    let crypto_json = serde_json::to_string(&crypto)
        .map_err(|error| format!("failed to serialize user crypto: {error}"))?;
    conn.execute(
        "insert into user_crypto (id, crypto_json, updated_at)
         values (?1, ?2, ?3)
         on conflict(id) do update set crypto_json = excluded.crypto_json, updated_at = excluded.updated_at",
        params![user_id, crypto_json, updated_at],
    )
    .map_err(|error| format!("failed to save user crypto: {error}"))?;
    Ok(())
}

fn strip_legacy_encrypted_payload(crypto: &serde_json::Value) -> serde_json::Value {
    let mut crypto = crypto.clone();
    if let Some(object) = crypto.as_object_mut() {
        object.remove("encryptedPayload");
    }
    crypto
}

fn load_user_sync_settings(app: &AppHandle, user_id: &str) -> Result<serde_json::Value, String> {
    let path = user_vault_path(app, user_id)?;
    if !path.exists() {
        return Ok(serde_json::Value::Null);
    }

    let conn = open_user_vault_connection(app, user_id)?;
    conn.query_row(
        "select mode, server_url, sync_space_id, account_id, account_label, device_id,
                cursor, connected_at, last_sync_at
         from sync_settings where id = 'default'",
        [],
        |row| {
            Ok(serde_json::json!({
                "mode": row.get::<_, String>(0)?,
                "serverUrl": row.get::<_, String>(1)?,
                "syncSpaceId": row.get::<_, Option<String>>(2)?,
                "accountId": row.get::<_, Option<String>>(3)?,
                "accountLabel": row.get::<_, Option<String>>(4)?,
                "deviceId": row.get::<_, Option<String>>(5)?,
                "cursor": row.get::<_, i64>(6)?,
                "connectedAt": row.get::<_, Option<String>>(7)?,
                "lastSyncAt": row.get::<_, Option<String>>(8)?
            }))
        },
    )
    .optional()
    .map_err(|error| format!("failed to load user sync settings: {error}"))
    .map(|value| value.unwrap_or(serde_json::Value::Null))
}

fn save_user_sync_settings(
    conn: &Connection,
    sync: &serde_json::Value,
    updated_at: &str,
) -> Result<(), String> {
    if sync.is_null() {
        conn.execute("delete from sync_settings where id = 'default'", [])
            .map_err(|error| format!("failed to clear user sync settings: {error}"))?;
        return Ok(());
    }

    let mode = sync
        .get("mode")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("selfhost");
    if !matches!(mode, "official" | "selfhost") {
        return Err("invalid sync settings mode".to_string());
    }

    let server_url = sync
        .get("serverUrl")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let cursor = sync
        .get("cursor")
        .and_then(serde_json::Value::as_i64)
        .unwrap_or(0);
    if cursor < 0 {
        return Err("invalid sync settings cursor".to_string());
    }

    conn.execute(
        "insert into sync_settings (
           id, mode, server_url, sync_space_id, account_id, account_label,
           device_id, cursor, connected_at, last_sync_at, updated_at
         ) values ('default', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         on conflict(id) do update set
           mode = excluded.mode,
           server_url = excluded.server_url,
           sync_space_id = excluded.sync_space_id,
           account_id = excluded.account_id,
           account_label = excluded.account_label,
           device_id = excluded.device_id,
           cursor = excluded.cursor,
           connected_at = excluded.connected_at,
           last_sync_at = excluded.last_sync_at,
           updated_at = excluded.updated_at",
        params![
            mode,
            server_url,
            optional_string_field(sync, "syncSpaceId"),
            optional_string_field(sync, "accountId"),
            optional_string_field(sync, "accountLabel"),
            optional_string_field(sync, "deviceId"),
            cursor,
            optional_string_field(sync, "connectedAt"),
            optional_string_field(sync, "lastSyncAt"),
            updated_at
        ],
    )
    .map_err(|error| format!("failed to save user sync settings: {error}"))?;
    Ok(())
}

fn validate_encrypted_object_record(record: &EncryptedObjectRecord) -> Result<(), String> {
    validate_path_segment(&record.object_id, "object id")?;
    validate_path_segment(&record.vault_id, "vault id")?;
    validate_path_segment(&record.key_id, "key id")?;
    validate_encrypted_object_type(&record.object_type)?;
    if !matches!(
        record.sync_state.as_str(),
        "clean" | "dirty" | "pending" | "conflicted"
    ) {
        return Err("invalid sync state".to_string());
    }
    if record.revision < 0 || record.base_revision < 0 {
        return Err("invalid object revision".to_string());
    }
    validate_envelope(&record.envelope, "encrypt-vault-object-v1")?;

    let aad = record
        .envelope
        .get("aad")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| "encrypted object envelope missing aad".to_string())?;
    if aad.get("objectId").and_then(serde_json::Value::as_str) != Some(record.object_id.as_str())
        || aad.get("objectType").and_then(serde_json::Value::as_str)
            != Some(record.object_type.as_str())
        || aad.get("vaultId").and_then(serde_json::Value::as_str) != Some(record.vault_id.as_str())
        || aad.get("revision").and_then(serde_json::Value::as_i64) != Some(record.revision)
    {
        return Err("encrypted object envelope metadata mismatch".to_string());
    }

    Ok(())
}

fn validate_encrypted_object_type(object_type: &str) -> Result<(), String> {
    if matches!(
        object_type,
        "vault_metadata" | "vault_item" | "vault_attachment"
    ) {
        Ok(())
    } else {
        Err("invalid object type".to_string())
    }
}

fn build_vault_store(
    settings: AppSettingsSnapshot,
    users: Vec<serde_json::Value>,
) -> serde_json::Value {
    let active_sync = settings
        .active_user_id
        .as_str()
        .and_then(|active_user_id| {
            users.iter().find(|user| {
                user.get("id").and_then(serde_json::Value::as_str) == Some(active_user_id)
            })
        })
        .and_then(|user| user.get("sync"))
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));

    serde_json::json!({
        "schemaVersion": DESKTOP_STORE_SCHEMA_VERSION,
        "activeUserId": settings.active_user_id,
        "users": users,
        "settings": {
            "locale": settings.locale,
            "deviceId": settings.device_id,
            "layout": settings.layout,
            "logging": settings.logging,
            "shortcuts": settings.shortcuts,
            "security": settings.security,
            "sync": active_sync
        }
    })
}

fn cleanup_removed_user_dirs(app: &AppHandle, user_ids: &[String]) -> Result<(), String> {
    let users_dir = users_dir(app)?;
    if !users_dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(&users_dir)
        .map_err(|error| format!("failed to read users directory: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("failed to read users directory entry: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("failed to read users directory entry type: {error}"))?;
        if !file_type.is_dir() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        if validate_path_segment(&name, "user id").is_err() {
            continue;
        }
        if user_ids.iter().any(|user_id| user_id == &name) {
            continue;
        }

        cleanup_user_secure_storage(app, &name);
        fs::remove_dir_all(entry.path())
            .map_err(|error| format!("failed to remove local user data: {error}"))?;
    }

    Ok(())
}

fn cleanup_user_secure_storage(app: &AppHandle, user_id: &str) {
    let _ = delete_recovery_key(user_id.to_string());
    let _ = delete_sync_device_token(user_id.to_string());

    let Ok(crypto) = load_user_crypto(app, user_id) else {
        return;
    };
    let Some(fast_unlock) = crypto
        .get("fastUnlock")
        .and_then(serde_json::Value::as_object)
    else {
        return;
    };
    let account_id = fast_unlock
        .get("accountId")
        .and_then(serde_json::Value::as_str);
    let device_id = fast_unlock
        .get("deviceId")
        .and_then(serde_json::Value::as_str);
    let device_key_id = fast_unlock
        .get("deviceKeyId")
        .and_then(serde_json::Value::as_str);
    if let (Some(account_id), Some(device_id), Some(device_key_id)) =
        (account_id, device_id, device_key_id)
    {
        let _ = delete_device_unlock_key(
            account_id.to_string(),
            user_id.to_string(),
            device_id.to_string(),
            device_key_id.to_string(),
        );
    }
}

fn reset_legacy_store_if_needed(app: &AppHandle) -> Result<(), String> {
    if app_meta_path(app)?.exists() {
        return Ok(());
    }

    let legacy_store_path = app_data_dir(app)?.join("vault-store.json");
    let legacy_attachment_dir = app_data_dir(app)?.join("attachments");
    if !legacy_store_path.exists() && !legacy_attachment_dir.exists() {
        return Ok(());
    }

    cleanup_legacy_secure_storage(&legacy_store_path);

    if legacy_store_path.exists() {
        fs::remove_file(&legacy_store_path)
            .map_err(|error| format!("failed to remove legacy vault store: {error}"))?;
    }
    if legacy_attachment_dir.exists() {
        fs::remove_dir_all(&legacy_attachment_dir)
            .map_err(|error| format!("failed to remove legacy attachments directory: {error}"))?;
    }

    Ok(())
}

fn cleanup_legacy_secure_storage(legacy_store_path: &Path) {
    let Ok(raw) = fs::read_to_string(legacy_store_path) else {
        return;
    };
    let Ok(data) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return;
    };
    let Some(users) = data.get("users").and_then(serde_json::Value::as_array) else {
        return;
    };

    for user in users {
        let Some(user_id) = user.get("id").and_then(serde_json::Value::as_str) else {
            continue;
        };
        if validate_path_segment(user_id, "user id").is_err() {
            continue;
        }
        let _ = delete_recovery_key(user_id.to_string());
        let _ = delete_sync_device_token(user_id.to_string());

        let Some(fast_unlock) = user
            .get("crypto")
            .and_then(|crypto| crypto.get("fastUnlock"))
            .and_then(serde_json::Value::as_object)
        else {
            continue;
        };
        let account_id = fast_unlock
            .get("accountId")
            .and_then(serde_json::Value::as_str);
        let device_id = fast_unlock
            .get("deviceId")
            .and_then(serde_json::Value::as_str);
        let device_key_id = fast_unlock
            .get("deviceKeyId")
            .and_then(serde_json::Value::as_str);
        if let (Some(account_id), Some(device_id), Some(device_key_id)) =
            (account_id, device_id, device_key_id)
        {
            let _ = delete_device_unlock_key(
                account_id.to_string(),
                user_id.to_string(),
                device_id.to_string(),
                device_key_id.to_string(),
            );
        }
    }
}

fn required_string_field<'a>(value: &'a serde_json::Value, field: &str) -> Result<&'a str, String> {
    value
        .get(field)
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("missing {field}"))
}

fn string_field(value: &serde_json::Value, field: &str) -> String {
    value
        .get(field)
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn optional_string_field(value: &serde_json::Value, field: &str) -> Option<String> {
    value
        .get(field)
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn current_timestamp_string() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    millis.to_string()
}

fn attachment_file_name(attachment_id: &str, original_file_name: &str) -> Result<String, String> {
    validate_path_segment(attachment_id, "attachment id")?;

    let extension = Path::new(original_file_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| {
            value
                .chars()
                .filter(|character| character.is_ascii_alphanumeric())
                .take(12)
                .collect::<String>()
        })
        .filter(|value| !value.is_empty());

    let file_name = match extension {
        Some(extension) => format!("{attachment_id}.{extension}"),
        None => attachment_id.to_string(),
    };
    validate_file_name(&file_name, "attachment file name")?;
    Ok(file_name)
}

fn attachment_blob_path(app: &AppHandle, encrypted_blob_ref: &str) -> Result<PathBuf, String> {
    match parse_attachment_blob_ref(encrypted_blob_ref)? {
        AttachmentBlobLocation::User {
            user_id,
            stored_name,
        } => Ok(user_attachment_dir(app, &user_id)?.join(stored_name)),
        AttachmentBlobLocation::Legacy { stored_name } => {
            Ok(app_data_dir(app)?.join("attachments").join(stored_name))
        }
    }
}

enum AttachmentBlobLocation {
    User {
        user_id: String,
        stored_name: String,
    },
    Legacy {
        stored_name: String,
    },
}

fn parse_attachment_blob_ref(value: &str) -> Result<AttachmentBlobLocation, String> {
    if let Some(rest) = value.strip_prefix("local://users/") {
        let (user_id, stored_name) = rest
            .split_once("/attachments/")
            .ok_or_else(|| "unsupported attachment reference".to_string())?;
        validate_path_segment(user_id, "user id")?;
        validate_file_name(stored_name, "attachment file name")?;
        return Ok(AttachmentBlobLocation::User {
            user_id: user_id.to_string(),
            stored_name: stored_name.to_string(),
        });
    }

    if let Some(stored_name) = value.strip_prefix("local://attachments/") {
        validate_file_name(stored_name, "attachment file name")?;
        return Ok(AttachmentBlobLocation::Legacy {
            stored_name: stored_name.to_string(),
        });
    }

    Err("unsupported attachment reference".to_string())
}

fn validate_path_segment(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty()
        || value.trim() != value
        || value == "."
        || value == ".."
        || value.contains("..")
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
    {
        return Err(format!("invalid {label}"));
    }

    Ok(())
}

fn validate_file_name(value: &str, label: &str) -> Result<(), String> {
    validate_path_segment(value, label)?;
    if value.contains('/') || value.contains('\\') {
        return Err(format!("invalid {label}"));
    }

    Ok(())
}

fn recovery_key_entry(user_id: &str) -> Result<Entry, String> {
    Entry::new(RECOVERY_KEY_SERVICE, user_id)
        .map_err(|error| format!("failed to open system secure storage: {error}"))
}

fn device_unlock_key_entry(
    account_id: &str,
    user_id: &str,
    device_id: &str,
    device_key_id: &str,
) -> Result<Entry, String> {
    Entry::new(
        DEVICE_UNLOCK_KEY_SERVICE,
        &format!("{account_id}:{user_id}:{device_id}:{device_key_id}"),
    )
    .map_err(|error| format!("failed to open system secure storage: {error}"))
}

#[cfg(target_os = "windows")]
fn save_device_unlock_key_windows(
    account_id: &str,
    user_id: &str,
    device_id: &str,
    device_key_id: &str,
    device_unlock_key: &str,
) -> Result<(), String> {
    let encrypted = windows_cng_encrypt_device_unlock_key(
        account_id,
        user_id,
        device_id,
        device_key_id,
        device_unlock_key.as_bytes(),
    )?;
    let stored_value = format!(
        "{WINDOWS_CNG_DEVICE_UNLOCK_PREFIX}{}",
        bytes_to_base64url(&encrypted)
    );

    device_unlock_key_entry(account_id, user_id, device_id, device_key_id)?
        .set_password(&stored_value)
        .map_err(|error| format!("failed to save protected device unlock key: {error}"))
}

#[cfg(target_os = "windows")]
fn load_device_unlock_key_windows(
    account_id: &str,
    user_id: &str,
    device_id: &str,
    device_key_id: &str,
) -> Result<Option<String>, String> {
    let stored_value = match device_unlock_key_entry(account_id, user_id, device_id, device_key_id)?
        .get_password()
    {
        Ok(value) => value,
        Err(KeyringError::NoEntry) => return Ok(None),
        Err(error) => {
            return Err(format!(
                "failed to load protected device unlock key: {error}"
            ))
        }
    };

    let Some(ciphertext) = stored_value.strip_prefix(WINDOWS_CNG_DEVICE_UNLOCK_PREFIX) else {
        save_device_unlock_key_windows(
            account_id,
            user_id,
            device_id,
            device_key_id,
            &stored_value,
        )?;
        return Ok(Some(stored_value));
    };

    let ciphertext = base64url_to_bytes(ciphertext)?;
    let plaintext = windows_cng_decrypt_device_unlock_key(
        account_id,
        user_id,
        device_id,
        device_key_id,
        &ciphertext,
    )?;
    String::from_utf8(plaintext)
        .map(Some)
        .map_err(|error| format!("protected device unlock key is not valid utf-8: {error}"))
}

#[cfg(target_os = "windows")]
fn delete_device_unlock_key_windows(
    account_id: &str,
    user_id: &str,
    device_id: &str,
    device_key_id: &str,
) -> Result<(), String> {
    match device_unlock_key_entry(account_id, user_id, device_id, device_key_id)?
        .delete_credential()
    {
        Ok(()) | Err(KeyringError::NoEntry) => {}
        Err(error) => {
            return Err(format!(
                "failed to delete protected device unlock key: {error}"
            ))
        }
    }

    delete_windows_cng_key(account_id, user_id, device_id, device_key_id)
}

#[cfg(target_os = "windows")]
struct NCryptObject {
    handle: usize,
}

#[cfg(target_os = "windows")]
impl NCryptObject {
    fn new(handle: usize) -> Self {
        Self { handle }
    }

    fn handle(&self) -> usize {
        self.handle
    }

    fn into_raw(mut self) -> usize {
        let handle = self.handle;
        self.handle = 0;
        handle
    }
}

#[cfg(target_os = "windows")]
impl Drop for NCryptObject {
    fn drop(&mut self) {
        if self.handle != 0 {
            unsafe {
                let _ = NCryptFreeObject(self.handle);
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn windows_cng_encrypt_device_unlock_key(
    account_id: &str,
    user_id: &str,
    device_id: &str,
    device_key_id: &str,
    plaintext: &[u8],
) -> Result<Vec<u8>, String> {
    let key = create_windows_cng_device_unlock_key(account_id, user_id, device_id, device_key_id)?;
    ncrypt_encrypt_oaep_sha256(key.handle() as NCRYPT_KEY_HANDLE, plaintext)
}

#[cfg(target_os = "windows")]
fn windows_cng_decrypt_device_unlock_key(
    account_id: &str,
    user_id: &str,
    device_id: &str,
    device_key_id: &str,
    ciphertext: &[u8],
) -> Result<Vec<u8>, String> {
    let key = open_windows_cng_device_unlock_key(account_id, user_id, device_id, device_key_id)?;
    ncrypt_decrypt_oaep_sha256(key.handle() as NCRYPT_KEY_HANDLE, ciphertext)
}

#[cfg(target_os = "windows")]
fn create_windows_cng_device_unlock_key(
    account_id: &str,
    user_id: &str,
    device_id: &str,
    device_key_id: &str,
) -> Result<NCryptObject, String> {
    let provider = open_windows_cng_provider()?;
    let key_name = wide_null(&windows_cng_key_name(
        account_id,
        user_id,
        device_id,
        device_key_id,
    ));
    let mut key_handle: NCRYPT_KEY_HANDLE = 0;
    ncrypt_result(
        unsafe {
            NCryptCreatePersistedKey(
                provider.handle() as NCRYPT_PROV_HANDLE,
                &mut key_handle,
                NCRYPT_RSA_ALGORITHM,
                key_name.as_ptr(),
                0,
                NCRYPT_OVERWRITE_KEY_FLAG,
            )
        },
        "create Windows protected device unlock key",
    )?;
    let key = NCryptObject::new(key_handle);

    ncrypt_set_u32_property(
        key.handle(),
        NCRYPT_LENGTH_PROPERTY,
        2048,
        "set device unlock key length",
    )?;
    ncrypt_set_u32_property(
        key.handle(),
        NCRYPT_KEY_USAGE_PROPERTY,
        NCRYPT_ALLOW_DECRYPT_FLAG,
        "set device unlock key usage",
    )?;
    ncrypt_set_ui_policy(key.handle())?;
    ncrypt_result(
        unsafe { NCryptFinalizeKey(key.handle() as NCRYPT_KEY_HANDLE, 0) },
        "finalize Windows protected device unlock key",
    )?;

    Ok(key)
}

#[cfg(target_os = "windows")]
fn open_windows_cng_device_unlock_key(
    account_id: &str,
    user_id: &str,
    device_id: &str,
    device_key_id: &str,
) -> Result<NCryptObject, String> {
    let provider = open_windows_cng_provider()?;
    let key_name = wide_null(&windows_cng_key_name(
        account_id,
        user_id,
        device_id,
        device_key_id,
    ));
    let mut key_handle: NCRYPT_KEY_HANDLE = 0;
    ncrypt_result(
        unsafe {
            NCryptOpenKey(
                provider.handle() as NCRYPT_PROV_HANDLE,
                &mut key_handle,
                key_name.as_ptr(),
                0,
                0,
            )
        },
        "open Windows protected device unlock key",
    )?;

    Ok(NCryptObject::new(key_handle))
}

#[cfg(target_os = "windows")]
fn delete_windows_cng_key(
    account_id: &str,
    user_id: &str,
    device_id: &str,
    device_key_id: &str,
) -> Result<(), String> {
    match open_windows_cng_device_unlock_key(account_id, user_id, device_id, device_key_id) {
        Ok(key) => {
            let handle = key.into_raw();
            ncrypt_result(
                unsafe { NCryptDeleteKey(handle as NCRYPT_KEY_HANDLE, 0) },
                "delete Windows protected device unlock key",
            )
        }
        Err(error) if error.contains(&format!("0x{:08X}", NTE_BAD_KEYSET as u32)) => Ok(()),
        Err(error) => Err(error),
    }
}

#[cfg(target_os = "windows")]
fn open_windows_cng_provider() -> Result<NCryptObject, String> {
    let mut provider_handle: NCRYPT_PROV_HANDLE = 0;
    ncrypt_result(
        unsafe { NCryptOpenStorageProvider(&mut provider_handle, MS_KEY_STORAGE_PROVIDER, 0) },
        "open Windows key storage provider",
    )?;
    Ok(NCryptObject::new(provider_handle))
}

#[cfg(target_os = "windows")]
fn ncrypt_set_u32_property(
    handle: usize,
    property: windows_sys::core::PCWSTR,
    value: u32,
    action: &str,
) -> Result<(), String> {
    ncrypt_result(
        unsafe {
            NCryptSetProperty(
                handle,
                property,
                (&value as *const u32).cast::<u8>(),
                std::mem::size_of::<u32>() as u32,
                0,
            )
        },
        action,
    )
}

#[cfg(target_os = "windows")]
fn ncrypt_set_ui_policy(handle: usize) -> Result<(), String> {
    let creation_title = wide_null("LockPass trusted device");
    let friendly_name = wide_null("LockPass device unlock key");
    let description = wide_null("Confirm with Windows to unlock this trusted device.");
    let policy = NCRYPT_UI_POLICY {
        dwVersion: 1,
        dwFlags: NCRYPT_UI_PROTECT_KEY_FLAG | NCRYPT_UI_FORCE_HIGH_PROTECTION_FLAG,
        pszCreationTitle: creation_title.as_ptr(),
        pszFriendlyName: friendly_name.as_ptr(),
        pszDescription: description.as_ptr(),
    };

    ncrypt_result(
        unsafe {
            NCryptSetProperty(
                handle,
                NCRYPT_UI_POLICY_PROPERTY,
                (&policy as *const NCRYPT_UI_POLICY).cast::<u8>(),
                std::mem::size_of::<NCRYPT_UI_POLICY>() as u32,
                0,
            )
        },
        "set Windows user presence policy for device unlock key",
    )
}

#[cfg(target_os = "windows")]
fn ncrypt_encrypt_oaep_sha256(key: NCRYPT_KEY_HANDLE, plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let mut padding = BCRYPT_OAEP_PADDING_INFO {
        pszAlgId: BCRYPT_SHA256_ALGORITHM,
        pbLabel: ptr::null_mut(),
        cbLabel: 0,
    };
    let mut output_len = 0u32;
    ncrypt_result(
        unsafe {
            NCryptEncrypt(
                key,
                plaintext.as_ptr(),
                u32::try_from(plaintext.len())
                    .map_err(|_| "device unlock key plaintext is too large".to_string())?,
                (&mut padding as *mut BCRYPT_OAEP_PADDING_INFO).cast(),
                ptr::null_mut(),
                0,
                &mut output_len,
                NCRYPT_PAD_OAEP_FLAG,
            )
        },
        "measure Windows protected device unlock key ciphertext",
    )?;

    let mut output = vec![0u8; output_len as usize];
    ncrypt_result(
        unsafe {
            NCryptEncrypt(
                key,
                plaintext.as_ptr(),
                u32::try_from(plaintext.len())
                    .map_err(|_| "device unlock key plaintext is too large".to_string())?,
                (&mut padding as *mut BCRYPT_OAEP_PADDING_INFO).cast(),
                output.as_mut_ptr(),
                output_len,
                &mut output_len,
                NCRYPT_PAD_OAEP_FLAG,
            )
        },
        "encrypt device unlock key with Windows protected key",
    )?;
    output.truncate(output_len as usize);
    Ok(output)
}

#[cfg(target_os = "windows")]
fn ncrypt_decrypt_oaep_sha256(
    key: NCRYPT_KEY_HANDLE,
    ciphertext: &[u8],
) -> Result<Vec<u8>, String> {
    let mut padding = BCRYPT_OAEP_PADDING_INFO {
        pszAlgId: BCRYPT_SHA256_ALGORITHM,
        pbLabel: ptr::null_mut(),
        cbLabel: 0,
    };
    let ciphertext_len = u32::try_from(ciphertext.len())
        .map_err(|_| "device unlock key ciphertext is too large".to_string())?;
    let mut output_len = ciphertext_len;
    let mut output = vec![0u8; ciphertext.len()];
    ncrypt_result(
        unsafe {
            NCryptDecrypt(
                key,
                ciphertext.as_ptr(),
                ciphertext_len,
                (&mut padding as *mut BCRYPT_OAEP_PADDING_INFO).cast(),
                output.as_mut_ptr(),
                output_len,
                &mut output_len,
                NCRYPT_PAD_OAEP_FLAG,
            )
        },
        "decrypt device unlock key with Windows protected key",
    )?;
    output.truncate(output_len as usize);
    Ok(output)
}

#[cfg(target_os = "windows")]
fn ncrypt_result(status: windows_sys::core::HRESULT, action: &str) -> Result<(), String> {
    if status >= 0 {
        Ok(())
    } else {
        Err(format!(
            "{action} failed with HRESULT 0x{:08X}",
            status as u32
        ))
    }
}

#[cfg(target_os = "windows")]
fn windows_cng_key_name(
    account_id: &str,
    user_id: &str,
    device_id: &str,
    device_key_id: &str,
) -> String {
    let scope = format!("{account_id}:{user_id}:{device_id}:{device_key_id}");
    format!(
        "LockPass Device Unlock {}",
        bytes_to_base64url(scope.as_bytes())
    )
}

fn sync_device_token_entry(user_id: &str) -> Result<Entry, String> {
    Entry::new(SYNC_DEVICE_TOKEN_SERVICE, user_id)
        .map_err(|error| format!("failed to open system secure storage: {error}"))
}

fn assert_supported_kdf(params: &KdfParams) -> Result<(), String> {
    if params.version != 1
        || params.name != "argon2id"
        || params.memory_kib < 65_536
        || params.iterations < 3
        || params.parallelism < 1
        || params.key_length_bytes != KEY_BYTES as u32
        || params.input_encoding != "domain-tagged-length-prefixed-utf8"
        || params.password_normalization != "NFKC"
        || params.purpose != UNLOCK_PURPOSE
    {
        return Err("Unsupported or weak KDF parameters".to_string());
    }

    Ok(())
}

fn validate_argon2_runtime_params(params: &KdfParams, salt: &[u8]) -> Result<(), String> {
    if salt.len() < 8 {
        return Err("\"salt\" must be of length 8..4Gb".to_string());
    }

    let parallelism = u64::from(params.parallelism);
    let rounded_memory_blocks =
        4 * parallelism * (u64::from(params.memory_kib) / (4 * parallelism));
    if rounded_memory_blocks * 1024 > ARGON2_MAXMEM_BYTES {
        return Err(format!(
            "\"maxmem\" limit was hit: memUsed(mP*1024)={}, maxmem={ARGON2_MAXMEM_BYTES}",
            rounded_memory_blocks * 1024
        ));
    }

    Ok(())
}

fn encode_unlock_input(password: &str, recovery_key: &str) -> Result<Vec<u8>, String> {
    let domain = UNLOCK_PURPOSE.as_bytes();
    let normalized_password = password.nfkc().collect::<String>();
    let password_bytes = normalized_password.as_bytes();
    let recovery_key_bytes = decode_recovery_key(recovery_key)?;

    let mut input =
        Vec::with_capacity(domain.len() + 4 + password_bytes.len() + 4 + recovery_key_bytes.len());
    input.extend_from_slice(domain);
    input.extend_from_slice(&length_prefix(password_bytes)?);
    input.extend_from_slice(password_bytes);
    input.extend_from_slice(&length_prefix(&recovery_key_bytes)?);
    input.extend_from_slice(&recovery_key_bytes);
    Ok(input)
}

fn decode_recovery_key(value: &str) -> Result<Vec<u8>, String> {
    let normalized = normalize_recovery_key_text(value);
    if normalized.is_empty() {
        return Err("Recovery key is required".to_string());
    }

    if normalized.len() == 52
        && normalized
            .chars()
            .all(|character| is_recovery_key_character(character))
    {
        return recovery_key_text_to_bytes(&normalized);
    }

    base64url_to_bytes(&normalized)
}

fn normalize_recovery_key_text(value: &str) -> String {
    let trimmed = value.trim();
    let raw = if trimmed.len() >= 3 && trimmed.as_bytes()[..3].eq_ignore_ascii_case(b"LP-") {
        &trimmed[3..]
    } else {
        trimmed
    };
    let mut normalized = String::new();
    let mut group_length = 0;

    for character in raw.chars().filter(|character| !character.is_whitespace()) {
        if character == '-' && group_length == 4 {
            group_length = 0;
            continue;
        }

        normalized.push(character);
        group_length += 1;
    }

    normalized
}

fn is_recovery_key_character(character: char) -> bool {
    matches!(character.to_ascii_uppercase(), 'A'..='H' | 'J'..='N' | 'P'..='Z' | '2'..='9')
}

fn recovery_key_text_to_bytes(value: &str) -> Result<Vec<u8>, String> {
    let mut output = Vec::with_capacity(RECOVERY_KEY_BYTES);
    let mut buffer = 0u32;
    let mut bits = 0u32;

    for character in value
        .chars()
        .map(|character| character.to_ascii_uppercase())
    {
        let index = RECOVERY_KEY_ALPHABET
            .find(character)
            .ok_or_else(|| "Invalid recovery key".to_string())? as u32;

        buffer = (buffer << 5) | index;
        bits += 5;
        while bits >= 8 {
            bits -= 8;
            output.push(((buffer >> bits) & 255) as u8);
            buffer &= (1 << bits) - 1;
        }
    }

    if output.len() != RECOVERY_KEY_BYTES {
        return Err("Invalid recovery key length".to_string());
    }

    Ok(output)
}

fn length_prefix(bytes: &[u8]) -> Result<[u8; 4], String> {
    let length = u32::try_from(bytes.len()).map_err(|_| "unlock input is too large".to_string())?;
    Ok(length.to_be_bytes())
}

fn bytes_to_base64url(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

fn base64url_to_bytes(value: &str) -> Result<Vec<u8>, String> {
    let normalized = value.replace('-', "+").replace('_', "/");
    let padding_length = (4 - normalized.len() % 4) % 4;
    let mut padded = String::with_capacity(normalized.len() + padding_length);
    padded.push_str(&normalized);
    padded.extend(std::iter::repeat('=').take(padding_length));

    STANDARD
        .decode(padded)
        .map_err(|error| format!("invalid base64url value: {error}"))
}

fn validate_vault_store(data: &serde_json::Value) -> Result<(), String> {
    if contains_forbidden_plaintext_key(data) {
        return Err(
            "vault store must not contain recoveryKey or deviceUnlockKey plaintext".to_string(),
        );
    }

    if data.get("vaults").is_some()
        || data.get("items").is_some()
        || data.get("attachments").is_some()
    {
        return Err("vault store must not contain plaintext payload fields".to_string());
    }

    if data
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        != Some(2)
    {
        return Err("vault store schemaVersion must be 2".to_string());
    }

    let users = data
        .get("users")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "vault store users must be an array".to_string())?;

    for user in users {
        if user.get("passwordAuth").is_some()
            || user.get("vaults").is_some()
            || user.get("items").is_some()
            || user.get("attachments").is_some()
        {
            return Err("user profile must not contain plaintext vault data".to_string());
        }

        let Some(crypto) = user.get("crypto") else {
            continue;
        };
        if crypto.is_null() {
            continue;
        }

        let kdf_name = crypto
            .get("kdfParams")
            .and_then(|params| params.get("name"))
            .and_then(serde_json::Value::as_str);
        if kdf_name != Some("argon2id") {
            return Err("user crypto must use argon2id KDF parameters".to_string());
        }

        validate_envelope(
            crypto
                .get("wrappedVaultKey")
                .ok_or_else(|| "user crypto missing wrappedVaultKey".to_string())?,
            "wrap-vault-key-v1",
        )?;
        if crypto
            .get("encryptedPayload")
            .filter(|value| !value.is_null())
            .is_some()
        {
            return Err(
                "user crypto must not contain encryptedPayload; use encrypted_objects rows"
                    .to_string(),
            );
        }

        if let Some(fast_unlock) = crypto.get("fastUnlock").filter(|value| !value.is_null()) {
            let fast_unlock = fast_unlock
                .as_object()
                .ok_or_else(|| "user crypto fastUnlock must be an object".to_string())?;
            validate_envelope(
                fast_unlock.get("deviceWrappedVaultKey").ok_or_else(|| {
                    "user crypto fastUnlock missing deviceWrappedVaultKey".to_string()
                })?,
                "device-wrap-vault-key-v1",
            )?;
        }
    }

    Ok(())
}

fn contains_forbidden_plaintext_key(value: &serde_json::Value) -> bool {
    match value {
        serde_json::Value::Object(map) => map.iter().any(|(key, child)| {
            key.eq_ignore_ascii_case("recoveryKey")
                || key.eq_ignore_ascii_case("deviceUnlockKey")
                || contains_forbidden_plaintext_key(child)
        }),
        serde_json::Value::Array(items) => items.iter().any(contains_forbidden_plaintext_key),
        _ => false,
    }
}

fn validate_attachment_envelope(bytes: &[u8]) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|_| "attachment blob must be an encrypted envelope".to_string())?;
    validate_envelope(&value, "encrypt-attachment-blob-v1")
}

fn validate_envelope(value: &serde_json::Value, purpose: &str) -> Result<(), String> {
    if value.get("version").and_then(serde_json::Value::as_u64) != Some(1) {
        return Err("encrypted envelope version must be 1".to_string());
    }

    if value.get("alg").and_then(serde_json::Value::as_str) != Some("AES-256-GCM") {
        return Err("encrypted envelope alg must be AES-256-GCM".to_string());
    }

    for field in ["keyId", "nonce", "ciphertext", "tag"] {
        if value
            .get(field)
            .and_then(serde_json::Value::as_str)
            .is_none()
        {
            return Err(format!("encrypted envelope missing {field}"));
        }
    }

    let aad = value
        .get("aad")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| "encrypted envelope missing aad".to_string())?;

    if aad.get("purpose").and_then(serde_json::Value::as_str) != Some(purpose) {
        return Err("encrypted envelope purpose mismatch".to_string());
    }

    Ok(())
}

fn set_main_window_title(app: &tauri::App) {
    if let Some(window) = app.get_webview_window("main") {
        let title = format!("LockPass {}", app.package_info().version);
        let _ = window.set_title(&title);
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(PendingDeepLinks::default())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            capture_deep_link_urls(app, argv);
            let _ = app.emit("lockpass://single-instance", ());
        }))
        .setup(|app| {
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            set_main_window_title(app);
            let _ = app.deep_link().register("lockpass");
            capture_deep_link_urls(&app.handle().clone(), std::env::args());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_status,
            lock_vault,
            sync_now,
            system_locale,
            open_external_url,
            get_app_data_dir,
            open_app_data_dir,
            save_text_file_to_downloads,
            open_file_parent_dir,
            open_log_dir,
            write_desktop_log,
            read_desktop_log,
            check_global_shortcut,
            load_start_on_login,
            set_start_on_login,
            take_pending_deep_links,
            save_recovery_key,
            load_recovery_key,
            delete_recovery_key,
            device_unlock_capability,
            save_device_unlock_key,
            load_device_unlock_key,
            delete_device_unlock_key,
            save_sync_device_token,
            load_sync_device_token,
            delete_sync_device_token,
            derive_unlock_key_argon2id,
            load_vault_store,
            save_vault_store,
            load_encrypted_objects,
            query_encrypted_objects,
            count_encrypted_objects_by_vault,
            save_encrypted_objects,
            upsert_encrypted_objects,
            read_legacy_lockpass_backup,
            save_attachment_blob,
            load_attachment_blob,
            delete_attachment_blob
        ])
        .run(tauri::generate_context!())
        .expect("error while running LockPass desktop application");
}

fn capture_deep_link_urls<I, S>(app: &AppHandle, args: I)
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let urls = collect_deep_link_urls(args);
    if urls.is_empty() {
        return;
    }

    #[cfg(debug_assertions)]
    eprintln!("[deep-link] received {} lockpass callback(s)", urls.len());

    if let Some(pending) = app.try_state::<PendingDeepLinks>() {
        if let Ok(mut pending_urls) = pending.urls.lock() {
            for url in &urls {
                if !pending_urls.iter().any(|pending_url| pending_url == url) {
                    pending_urls.push(url.clone());
                }
            }
        }
    }

    let _ = app.emit(DEEP_LINK_EVENT, urls);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn collect_deep_link_urls<I, S>(args: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut urls = Vec::new();
    for arg in args {
        for url in extract_deep_link_urls(arg.as_ref()) {
            if !urls.iter().any(|existing| existing == &url) {
                urls.push(url);
            }
        }
    }
    urls
}

fn extract_deep_link_urls(value: &str) -> Vec<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let lower = trimmed.to_ascii_lowercase();
    let mut urls = Vec::new();
    let mut offset = 0;
    while let Some(relative_start) = lower[offset..].find(DEEP_LINK_SCHEME) {
        let start = offset + relative_start;
        let end = trimmed[start..]
            .char_indices()
            .find_map(|(index, character)| {
                if index > 0 && is_deep_link_delimiter(character) {
                    Some(start + index)
                } else {
                    None
                }
            })
            .unwrap_or(trimmed.len());
        let url = trimmed[start..end].trim_matches(char::from(0)).to_string();
        if !url.is_empty() && !urls.iter().any(|existing| existing == &url) {
            urls.push(url);
        }
        offset = end.saturating_add(1);
        if offset >= trimmed.len() {
            break;
        }
    }
    urls
}

fn is_deep_link_delimiter(character: char) -> bool {
    character.is_whitespace() || matches!(character, '"' | '\'' | '|' | '<' | '>')
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn collect_deep_link_urls_reads_plain_and_forwarded_args() {
        let urls = collect_deep_link_urls([
            "target/debug/lockpass-next-desktop.exe",
            "lockpass://auth/callback?deviceAuthId=one&state=two",
            "E:\\workspace|target\\debug\\lockpass-next-desktop.exe|lockpass://auth/callback?deviceAuthId=three&state=four",
            "\"lockpass://auth/callback?deviceAuthId=five&state=six\"",
        ]);

        assert_eq!(
            urls,
            vec![
                "lockpass://auth/callback?deviceAuthId=one&state=two",
                "lockpass://auth/callback?deviceAuthId=three&state=four",
                "lockpass://auth/callback?deviceAuthId=five&state=six",
            ]
        );
    }

    #[test]
    fn collect_deep_link_urls_deduplicates_callbacks() {
        let callback = "lockpass://auth/callback?deviceAuthId=one&state=two";
        let urls = collect_deep_link_urls([callback, callback, &format!("ignored|{callback}")]);

        assert_eq!(urls, vec![callback]);
    }

    #[test]
    fn attachment_blob_ref_supports_user_scoped_paths() {
        let location =
            parse_attachment_blob_ref("local://users/user-123/attachments/attachment-456.lpblob")
                .expect("user scoped ref should parse");

        match location {
            AttachmentBlobLocation::User {
                user_id,
                stored_name,
            } => {
                assert_eq!(user_id, "user-123");
                assert_eq!(stored_name, "attachment-456.lpblob");
            }
            AttachmentBlobLocation::Legacy { .. } => panic!("expected user scoped ref"),
        }
    }

    #[test]
    fn attachment_blob_ref_rejects_path_traversal() {
        assert!(
            parse_attachment_blob_ref("local://users/../attachments/attachment.lpblob").is_err()
        );
        assert!(
            parse_attachment_blob_ref("local://users/user-1/attachments/../secret.lpblob").is_err()
        );
        assert!(parse_attachment_blob_ref("local://attachments/..\\secret.lpblob").is_err());
    }

    #[test]
    #[ignore = "touches OS secure storage; run manually when validating recovery key persistence"]
    fn recovery_key_round_trips_through_os_secure_storage() {
        let user_id = format!("lockpass-test-{}", std::process::id());
        let recovery_key = "LP-TEST-KEY-2345-6789-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ";

        save_recovery_key(user_id.clone(), recovery_key.to_string())
            .expect("recovery key should save");

        let loaded = load_recovery_key(user_id.clone()).expect("recovery key should load");
        delete_recovery_key(user_id.clone()).expect("recovery key should delete");
        assert_eq!(loaded.as_deref(), Some(recovery_key));

        let loaded_after_delete =
            load_recovery_key(user_id).expect("recovery key lookup after delete should succeed");
        assert_eq!(loaded_after_delete, None);
    }

    #[test]
    #[ignore = "touches OS secure storage; run manually when validating trusted device fast unlock persistence"]
    fn device_unlock_key_round_trips_through_os_secure_storage() {
        let user_id = format!("lockpass-test-{}", std::process::id());
        let account_id = user_id.clone();
        let device_id = "device-test";
        let device_key_id = "device-key-test";
        let device_unlock_key = "test-device-unlock-key";

        save_device_unlock_key(
            account_id.clone(),
            user_id.clone(),
            device_id.to_string(),
            device_key_id.to_string(),
            device_unlock_key.to_string(),
        )
        .expect("device unlock key should save");

        let loaded = load_device_unlock_key(
            account_id.clone(),
            user_id.clone(),
            device_id.to_string(),
            device_key_id.to_string(),
        )
        .expect("device unlock key should load");
        delete_device_unlock_key(
            account_id.clone(),
            user_id.clone(),
            device_id.to_string(),
            device_key_id.to_string(),
        )
        .expect("device unlock key should delete");
        assert_eq!(loaded.as_deref(), Some(device_unlock_key));

        let loaded_after_delete = load_device_unlock_key(
            account_id,
            user_id,
            device_id.to_string(),
            device_key_id.to_string(),
        )
        .expect("device unlock key lookup after delete should succeed");
        assert_eq!(loaded_after_delete, None);
    }

    #[test]
    fn rust_argon2id_unlock_key_matches_frontend_encoding() {
        let params = KdfParams {
            version: 1,
            name: "argon2id".to_string(),
            memory_kib: 65_536,
            iterations: 3,
            parallelism: 1,
            salt: "AQIDBAUGBwgJCgsMDQ4PEA".to_string(),
            key_length_bytes: 32,
            input_encoding: "domain-tagged-length-prefixed-utf8".to_string(),
            password_normalization: "NFKC".to_string(),
            purpose: "lockpass unlock v1".to_string(),
        };

        let derived = derive_unlock_key_argon2id_inner(
            "p\u{e4}ssword-\u{6d4b}\u{8bd5}".to_string(),
            "LP-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-6789-ABCD-EFGH-JKLM-NPQR-STUV".to_string(),
            params,
        )
        .expect("unlock key should derive");

        assert_eq!(derived, "Aj32HCnL3306nnKc_LIww1dio3lv5PAkNbcIK9plgzk");
    }

    #[test]
    fn app_meta_migrations_create_expected_tables() {
        let conn = Connection::open_in_memory().expect("in-memory sqlite should open");
        let conn = migrate_app_meta_schema(conn).expect("app metadata migrations should run");

        assert!(sqlite_table_exists(&conn, "app_settings"));
        assert!(sqlite_table_exists(&conn, "users"));
        assert!(sqlite_table_exists(&conn, "refinery_schema_history"));
        assert!(!sqlite_table_exists(&conn, "migration_jobs"));
        assert!(!sqlite_table_exists(&conn, "schema_migrations"));
    }

    #[test]
    fn user_vault_migrations_create_expected_tables() {
        let conn = Connection::open_in_memory().expect("in-memory sqlite should open");
        let conn = migrate_user_vault_schema(conn).expect("user vault migrations should run");

        assert!(sqlite_table_exists(&conn, "user_crypto"));
        assert!(sqlite_table_exists(&conn, "local_settings"));
        assert!(sqlite_table_exists(&conn, "sync_settings"));
        assert!(sqlite_table_exists(&conn, "encrypted_objects"));
        assert!(sqlite_table_exists(&conn, "refinery_schema_history"));
        assert!(sqlite_index_exists(&conn, "encrypted_objects_vault_idx"));
        assert!(!sqlite_table_exists(&conn, "schema_migrations"));
        assert!(!sqlite_table_exists(&conn, "user_profile"));
    }

    #[test]
    fn encrypted_object_queries_filter_and_count_without_decrypting_payloads() {
        let conn = Connection::open_in_memory().expect("in-memory sqlite should open");
        let conn = migrate_user_vault_schema(conn).expect("user vault migrations should run");

        insert_test_encrypted_object(&conn, "vault-1", "vault_metadata", "vault-1", None);
        insert_test_encrypted_object(&conn, "item-1", "vault_item", "vault-1", None);
        insert_test_encrypted_object(&conn, "item-2", "vault_item", "vault-2", None);
        insert_test_encrypted_object(&conn, "attachment-1", "vault_attachment", "vault-1", None);

        assert_eq!(
            test_query_encrypted_object_ids(&conn, Some("vault_metadata"), None),
            vec!["vault-1"]
        );
        assert_eq!(
            test_query_encrypted_object_ids(&conn, None, Some("vault-1")),
            vec!["attachment-1", "item-1", "vault-1"]
        );
        assert_eq!(
            test_count_objects_by_vault(&conn, "vault_item"),
            vec![("vault-1".to_string(), 1), ("vault-2".to_string(), 1)]
        );
    }

    #[test]
    fn encrypted_object_upsert_preserves_unloaded_rows() {
        let conn = Connection::open_in_memory().expect("in-memory sqlite should open");
        let conn = migrate_user_vault_schema(conn).expect("user vault migrations should run");

        insert_test_encrypted_object(&conn, "item-1", "vault_item", "vault-1", None);
        insert_test_encrypted_object(&conn, "item-2", "vault_item", "vault-2", None);
        upsert_test_encrypted_object(&conn, "item-1", "vault_item", "vault-1", Some(2));

        assert_eq!(test_encrypted_object_count(&conn), 2);
        assert_eq!(
            test_query_encrypted_object_ids(&conn, None, None),
            vec!["item-1", "item-2"]
        );
        assert_eq!(
            conn.query_row(
                "select revision from encrypted_objects where object_id = 'item-1'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .expect("updated row should exist"),
            2
        );
    }

    #[test]
    fn vault_store_accepts_device_fast_unlock_envelope() {
        let store = vault_store_with_fast_unlock(json!({
            "version": 1,
            "alg": "AES-256-GCM",
            "keyId": "device-key-1",
            "nonce": "nonce",
            "aad": {
                "purpose": "device-wrap-vault-key-v1",
                "accountId": "user-1",
                "userId": "user-1",
                "deviceId": "device-1",
                "vaultId": "vault-1",
                "keyId": "key-1",
                "deviceKeyId": "device-key-1",
                "schemaVersion": 1
            },
            "ciphertext": "ciphertext",
            "tag": "tag"
        }));

        validate_vault_store(&store).expect("valid fast unlock envelope should pass");
    }

    #[test]
    fn vault_store_rejects_device_unlock_key_plaintext() {
        let mut store = vault_store_with_fast_unlock(json!({
            "version": 1,
            "alg": "AES-256-GCM",
            "keyId": "device-key-1",
            "nonce": "nonce",
            "aad": {
                "purpose": "device-wrap-vault-key-v1"
            },
            "ciphertext": "ciphertext",
            "tag": "tag"
        }));
        store["users"][0]["crypto"]["fastUnlock"]["deviceUnlockKey"] = json!("plaintext-secret");

        let error =
            validate_vault_store(&store).expect_err("plaintext device unlock key must be rejected");
        assert!(error.contains("deviceUnlockKey"));
    }

    #[test]
    fn vault_store_rejects_device_fast_unlock_wrong_purpose() {
        let store = vault_store_with_fast_unlock(json!({
            "version": 1,
            "alg": "AES-256-GCM",
            "keyId": "device-key-1",
            "nonce": "nonce",
            "aad": {
                "purpose": "wrap-vault-key-v1"
            },
            "ciphertext": "ciphertext",
            "tag": "tag"
        }));

        let error =
            validate_vault_store(&store).expect_err("wrong fast unlock purpose must be rejected");
        assert!(error.contains("purpose mismatch"));
    }

    #[test]
    fn vault_store_rejects_legacy_encrypted_profile_payload() {
        let mut store = vault_store_with_fast_unlock(json!({
            "version": 1,
            "alg": "AES-256-GCM",
            "keyId": "device-key-1",
            "nonce": "nonce",
            "aad": {
                "purpose": "device-wrap-vault-key-v1",
                "accountId": "user-1",
                "userId": "user-1",
                "deviceId": "device-1",
                "vaultId": "vault-1",
                "keyId": "key-1",
                "deviceKeyId": "device-key-1",
                "schemaVersion": 1
            },
            "ciphertext": "ciphertext",
            "tag": "tag"
        }));
        store["users"][0]["crypto"]["encryptedPayload"] =
            encrypted_envelope("encrypt-desktop-user-payload-v1");

        let error =
            validate_vault_store(&store).expect_err("legacy encrypted payload must be rejected");
        assert!(error.contains("encryptedPayload"));
    }

    #[test]
    fn encrypted_object_record_rejects_metadata_mismatch() {
        let mut record = encrypted_object_record();
        record.envelope["aad"]["objectId"] = json!("different-object");

        let error = validate_encrypted_object_record(&record)
            .expect_err("encrypted object aad mismatch must be rejected");
        assert!(error.contains("metadata mismatch"));
    }

    #[test]
    fn encrypted_object_record_accepts_matching_metadata() {
        validate_encrypted_object_record(&encrypted_object_record())
            .expect("matching encrypted object metadata should pass");
    }

    fn vault_store_with_fast_unlock(
        device_wrapped_vault_key: serde_json::Value,
    ) -> serde_json::Value {
        json!({
            "schemaVersion": 2,
            "activeUserId": "user-1",
            "users": [
                {
                    "id": "user-1",
                    "username": "user-1",
                    "displayName": "User 1",
                    "createdAt": "2026-01-01T00:00:00.000Z",
                    "updatedAt": "2026-01-01T00:00:00.000Z",
                    "crypto": {
                        "keyId": "key-1",
                        "kdfParams": {
                            "name": "argon2id"
                        },
                        "wrappedVaultKey": encrypted_envelope("wrap-vault-key-v1"),
                        "fastUnlock": {
                            "version": 1,
                            "accountId": "user-1",
                            "userId": "user-1",
                            "deviceId": "device-1",
                            "vaultId": "vault-1",
                            "keyId": "key-1",
                            "deviceKeyId": "device-key-1",
                            "createdAt": "2026-01-01T00:00:00.000Z",
                            "updatedAt": "2026-01-01T00:00:00.000Z",
                            "deviceWrappedVaultKey": device_wrapped_vault_key
                        }
                    }
                }
            ],
            "settings": {
                "locale": "zh-CN",
                "deviceId": "device-1"
            }
        })
    }

    fn encrypted_envelope(purpose: &str) -> serde_json::Value {
        json!({
            "version": 1,
            "alg": "AES-256-GCM",
            "keyId": "key-1",
            "nonce": "nonce",
            "aad": {
                "purpose": purpose
            },
            "ciphertext": "ciphertext",
            "tag": "tag"
        })
    }

    fn test_encrypted_object_envelope(
        object_id: &str,
        object_type: &str,
        vault_id: &str,
        revision: i64,
    ) -> String {
        json!({
            "version": 1,
            "alg": "AES-256-GCM",
            "keyId": "key-1",
            "nonce": "nonce",
            "aad": {
                "purpose": "encrypt-vault-object-v1",
                "objectType": object_type,
                "objectId": object_id,
                "vaultId": vault_id,
                "schemaVersion": 1,
                "keyId": "key-1",
                "revision": revision
            },
            "ciphertext": "ciphertext",
            "tag": "tag"
        })
        .to_string()
    }

    fn insert_test_encrypted_object(
        conn: &Connection,
        object_id: &str,
        object_type: &str,
        vault_id: &str,
        revision: Option<i64>,
    ) {
        let revision = revision.unwrap_or(1);
        conn.execute(
            "insert into encrypted_objects (
               object_id, object_type, vault_id, revision, base_revision, sync_state,
               deleted_at, updated_at, key_id, envelope_json
             ) values (?1, ?2, ?3, ?4, 0, 'clean', null, '2026-01-01T00:00:00.000Z', 'key-1', ?5)",
            params![
                object_id,
                object_type,
                vault_id,
                revision,
                test_encrypted_object_envelope(object_id, object_type, vault_id, revision)
            ],
        )
        .expect("test encrypted object should insert");
    }

    fn upsert_test_encrypted_object(
        conn: &Connection,
        object_id: &str,
        object_type: &str,
        vault_id: &str,
        revision: Option<i64>,
    ) {
        let revision = revision.unwrap_or(1);
        conn.execute(
            "insert into encrypted_objects (
               object_id, object_type, vault_id, revision, base_revision, sync_state,
               deleted_at, updated_at, key_id, envelope_json
             ) values (?1, ?2, ?3, ?4, 0, 'clean', null, '2026-01-01T00:00:00.000Z', 'key-1', ?5)
             on conflict(object_id) do update set
               object_type = excluded.object_type,
               vault_id = excluded.vault_id,
               revision = excluded.revision,
               base_revision = excluded.base_revision,
               sync_state = excluded.sync_state,
               deleted_at = excluded.deleted_at,
               updated_at = excluded.updated_at,
               key_id = excluded.key_id,
               envelope_json = excluded.envelope_json",
            params![
                object_id,
                object_type,
                vault_id,
                revision,
                test_encrypted_object_envelope(object_id, object_type, vault_id, revision)
            ],
        )
        .expect("test encrypted object should upsert");
    }

    fn test_query_encrypted_object_ids(
        conn: &Connection,
        object_type: Option<&str>,
        vault_id: Option<&str>,
    ) -> Vec<String> {
        let mut stmt = conn
            .prepare(
                "select object_id
                 from encrypted_objects
                 where (?1 is null or object_type = ?1)
                   and (?2 is null or vault_id = ?2)
                 order by object_id",
            )
            .expect("test query should prepare");
        stmt.query_map(params![object_type, vault_id], |row| {
            row.get::<_, String>(0)
        })
        .expect("test query should run")
        .collect::<Result<Vec<_>, _>>()
        .expect("test query rows should read")
    }

    fn test_count_objects_by_vault(conn: &Connection, object_type: &str) -> Vec<(String, i64)> {
        let mut stmt = conn
            .prepare(
                "select vault_id, count(*)
                 from encrypted_objects
                 where object_type = ?1 and deleted_at is null
                 group by vault_id
                 order by vault_id",
            )
            .expect("test count query should prepare");
        stmt.query_map(params![object_type], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .expect("test count query should run")
        .collect::<Result<Vec<_>, _>>()
        .expect("test count rows should read")
    }

    fn test_encrypted_object_count(conn: &Connection) -> i64 {
        conn.query_row("select count(*) from encrypted_objects", [], |row| {
            row.get::<_, i64>(0)
        })
        .expect("test count should read")
    }

    fn sqlite_table_exists(conn: &Connection, table_name: &str) -> bool {
        sqlite_object_exists(conn, "table", table_name)
    }

    fn sqlite_index_exists(conn: &Connection, index_name: &str) -> bool {
        sqlite_object_exists(conn, "index", index_name)
    }

    fn sqlite_object_exists(conn: &Connection, object_type: &str, object_name: &str) -> bool {
        conn.query_row(
            "select exists(select 1 from sqlite_master where type = ?1 and name = ?2)",
            params![object_type, object_name],
            |row| row.get::<_, bool>(0),
        )
        .expect("sqlite schema query should succeed")
    }

    fn encrypted_object_record() -> EncryptedObjectRecord {
        EncryptedObjectRecord {
            object_id: "item-11111111-1111-4111-8111-111111111111".to_string(),
            object_type: "vault_item".to_string(),
            vault_id: "vault-22222222-2222-4222-8222-222222222222".to_string(),
            revision: 3,
            base_revision: 2,
            sync_state: "dirty".to_string(),
            deleted_at: None,
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
            key_id: "key-1".to_string(),
            envelope: json!({
                "version": 1,
                "alg": "AES-256-GCM",
                "keyId": "key-1",
                "nonce": "nonce",
                "aad": {
                    "purpose": "encrypt-vault-object-v1",
                    "objectType": "vault_item",
                    "objectId": "item-11111111-1111-4111-8111-111111111111",
                    "vaultId": "vault-22222222-2222-4222-8222-222222222222",
                    "schemaVersion": 1,
                    "keyId": "key-1",
                    "revision": 3
                },
                "ciphertext": "ciphertext",
                "tag": "tag"
            }),
        }
    }
}
