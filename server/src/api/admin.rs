use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::{delete, get, post},
    Json, Router,
};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    api::{auth_principal, ensure_admin, ok},
    email_template::{self, EmailTemplateVariables},
    error::AppResult,
    model::{
        AdminAccountPatchRequest, AdminConfigPatchRequest, AdminEmailTemplatePreviewRequest,
        AdminEmailTemplateUpdateRequest, AdminEmailTestConnectionRequest,
        AdminEmailTestSendRequest, AdminPasswordChangeRequest, AdminRoleGrantRequest,
    },
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/accounts", get(accounts))
        .route("/accounts/:id", get(account).patch(patch_account))
        .route("/accounts/:id/roles", post(grant_role))
        .route("/accounts/:id/roles/:role", delete(revoke_role))
        .route("/devices", get(devices))
        .route("/devices/:id", delete(revoke_device))
        .route("/password", post(change_password))
        .route("/config", get(config).patch(patch_config))
        .route("/email/test-connection", post(test_email_connection))
        .route("/email/send-test", post(send_test_email))
        .route("/email/templates", get(email_templates))
        .route("/email/templates/preview", post(preview_email_template))
        .route(
            "/email/templates/:template_id",
            get(email_template).put(update_email_template),
        )
        .route(
            "/email/templates/:template_id/restore",
            post(restore_email_template),
        )
        .route("/roles", get(roles))
        .route("/sync-data", get(sync_data))
        .route("/audit-logs", get(audit_logs))
}

async fn change_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AdminPasswordChangeRequest>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    if principal.device_id.is_some() {
        return Err(crate::error::AppError::Unauthorized);
    }
    Ok(Json(json!(state.store.admin_change_password(
        &principal,
        &payload.current_password,
        &payload.new_password
    )?)))
}

async fn accounts(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    Ok(Json(json!(state.store.admin_accounts()?)))
}

async fn account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(account_id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    Ok(Json(json!(state.store.admin_account(account_id)?)))
}

async fn patch_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(account_id): Path<Uuid>,
    Json(payload): Json<AdminAccountPatchRequest>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    Ok(Json(json!(state
        .store
        .admin_patch_account(&principal, account_id, payload)?)))
}

async fn devices(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    Ok(Json(json!(state.store.admin_devices()?)))
}

async fn revoke_device(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(device_id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    state.store.admin_revoke_device(&principal, device_id)?;
    Ok(ok())
}

async fn config(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    Ok(Json(json!(state.store.admin_config()?)))
}

async fn patch_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AdminConfigPatchRequest>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    Ok(Json(json!(state
        .store
        .admin_patch_config(&principal, payload)?)))
}

async fn test_email_connection(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AdminEmailTestConnectionRequest>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    let config = state.store.admin_email_config_with_patch(payload.email)?;
    state.mailer.test_connection(&config).await?;
    Ok(ok())
}

async fn send_test_email(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AdminEmailTestSendRequest>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    let config = state.store.admin_email_config_with_patch(payload.email)?;
    let recipient = payload.recipient.trim().to_string();
    let rendered = email_template::render_by_id(
        &config,
        &payload.template_id,
        EmailTemplateVariables {
            display_name: None,
            email: &recipient,
            code: "123456",
            expires_minutes: 10,
        },
    )?;
    state
        .mailer
        .send_rendered_email(&config, &recipient, rendered)
        .await?;
    Ok(ok())
}

async fn email_templates(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    Ok(Json(json!(state.store.admin_email_templates()?)))
}

async fn email_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(template_id): Path<String>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    Ok(Json(json!(state
        .store
        .admin_email_template(template_id)?)))
}

async fn update_email_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(template_id): Path<String>,
    Json(payload): Json<AdminEmailTemplateUpdateRequest>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    Ok(Json(json!(state.store.admin_update_email_template(
        &principal,
        template_id,
        payload,
    )?)))
}

async fn restore_email_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(template_id): Path<String>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    Ok(Json(json!(state
        .store
        .admin_restore_email_template(&principal, template_id)?)))
}

async fn preview_email_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AdminEmailTemplatePreviewRequest>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    Ok(Json(json!(email_template::preview_template(
        &payload.template_id,
        &payload.subject,
        &payload.html,
    )?)))
}

async fn roles(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    Ok(Json(state.store.admin_roles()?))
}

async fn sync_data(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    Ok(Json(state.store.admin_sync_data()?))
}

async fn grant_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(account_id): Path<Uuid>,
    Json(payload): Json<AdminRoleGrantRequest>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    Ok(Json(json!(state.store.admin_grant_role(
        &principal,
        account_id,
        payload.role
    )?)))
}

async fn revoke_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((account_id, role)): Path<(Uuid, String)>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    Ok(Json(json!(state
        .store
        .admin_revoke_role(&principal, account_id, role)?)))
}

async fn audit_logs(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    ensure_admin(&principal)?;
    Ok(Json(json!(state.store.admin_audit_logs()?)))
}
