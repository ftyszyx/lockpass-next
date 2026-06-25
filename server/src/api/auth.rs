use axum::{
    extract::{ConnectInfo, Path, State},
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::net::SocketAddr;

use crate::{
    api::{auth_principal, auth_principal_with_client_ip, client_ip, ok},
    error::{AppError, AppResult},
    model::{
        AccountCompleteRequest, AdminLoginRequest, DeviceBindRequest, EmailStartRequest,
        EmailVerifyRequest,
    },
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/me", get(me))
        .route("/logout", post(logout))
        .route("/email/start", post(email_start))
        .route("/email/verify", post(email_verify))
        .route("/email/complete-login", post(email_complete_login))
        .route("/admin/login", post(admin_login))
        .route("/account/complete", post(account_complete))
        .route("/sms/send", post(sms_placeholder))
        .route("/sms/verify", post(sms_placeholder))
        .route("/oauth/:provider/start", get(oauth_placeholder))
        .route("/callback/:provider", get(oauth_placeholder))
        .route("/device/bind", post(device_bind))
}

async fn me(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    Ok(Json(json!(state.store.me(&principal)?)))
}

async fn logout(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    if let Some(value) = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
    {
        state.store.logout_bearer(value)?;
    }
    Ok(ok())
}

async fn admin_login(
    State(state): State<AppState>,
    Json(payload): Json<AdminLoginRequest>,
) -> AppResult<Json<Value>> {
    Ok(Json(json!(state.store.login_admin_password(
        &payload.username,
        &payload.password
    )?)))
}

async fn email_start(
    State(state): State<AppState>,
    Json(payload): Json<EmailStartRequest>,
) -> AppResult<Json<Value>> {
    let display_name = payload.display_name.clone();
    let (response, code, email_config) =
        state
            .store
            .start_email_challenge(&payload.email, payload.display_name, payload.purpose)?;
    state
        .mailer
        .send_email_code(
            &email_config,
            &response.email,
            display_name.as_deref(),
            &code,
            (response.expires_at - chrono::Utc::now())
                .num_minutes()
                .max(1),
        )
        .await?;
    Ok(Json(json!(response)))
}

async fn email_verify(
    State(state): State<AppState>,
    Json(payload): Json<EmailVerifyRequest>,
) -> AppResult<Json<Value>> {
    Ok(Json(json!(state.store.verify_email_challenge(
        payload.challenge_id,
        &payload.code
    )?)))
}

async fn email_complete_login(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Value>> {
    let setup_token = bearer_token(&headers)?;
    Ok(Json(json!(state
        .store
        .complete_email_login(setup_token)?)))
}

async fn account_complete(
    State(state): State<AppState>,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    headers: HeaderMap,
    Json(payload): Json<AccountCompleteRequest>,
) -> AppResult<Json<Value>> {
    let setup_token = bearer_token(&headers)?;
    Ok(Json(json!(state.store.complete_email_account_setup(
        setup_token,
        payload.device_name,
        payload.client_device_id,
        client_ip(&headers, connect_info.as_ref())
    )?)))
}

async fn device_bind(
    State(state): State<AppState>,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    headers: HeaderMap,
    Json(payload): Json<DeviceBindRequest>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal_with_client_ip(&state, &headers, connect_info.as_ref())?;
    Ok(Json(json!(state.store.bind_device(
        &principal,
        payload.device_name,
        payload.client_device_id,
        client_ip(&headers, connect_info.as_ref())
    )?)))
}

async fn sms_placeholder() -> AppResult<Json<Value>> {
    Err(AppError::NotImplemented(
        "sms login is reserved for the provider integration phase".to_string(),
    ))
}

async fn oauth_placeholder(Path(provider): Path<String>) -> AppResult<Json<Value>> {
    Err(AppError::NotImplemented(format!(
        "{provider} oauth is reserved for the provider integration phase"
    )))
}

fn bearer_token(headers: &HeaderMap) -> AppResult<&str> {
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|token| !token.trim().is_empty())
        .ok_or(AppError::Unauthorized)
}
