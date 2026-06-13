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
    model::{DeviceBindRequest, EmailLoginRequest, EmailRegisterRequest},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/me", get(me))
        .route("/logout", post(logout))
        .route("/email/register", post(email_register))
        .route("/email/login", post(email_login))
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

async fn email_register(
    State(state): State<AppState>,
    Json(payload): Json<EmailRegisterRequest>,
) -> AppResult<Json<Value>> {
    Ok(Json(json!(state.store.register_email(
        &payload.email,
        &payload.password,
        payload.display_name
    )?)))
}

async fn email_login(
    State(state): State<AppState>,
    Json(payload): Json<EmailLoginRequest>,
) -> AppResult<Json<Value>> {
    Ok(Json(json!(state
        .store
        .login_email(&payload.email, &payload.password)?)))
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
