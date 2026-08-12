use axum::{
    extract::{ConnectInfo, State},
    http::{header, HeaderMap, HeaderValue, Method},
    middleware,
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};
use std::net::SocketAddr;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    trace::TraceLayer,
};

use crate::{
    error::{AppError, AppResult},
    model::AuthPrincipal,
    rbac, server_log,
    state::AppState,
};

pub mod admin;
pub mod auth;
pub mod console;
pub mod devices;
pub mod sync;

pub fn router(state: AppState) -> Router {
    let cors = cors_layer(&state);
    let server_log_layer =
        middleware::from_fn_with_state(state.clone(), server_log::capture_server_log);

    Router::new()
        .route("/health", get(health))
        .nest("/auth", auth::router())
        .nest("/devices", devices::router())
        .nest("/sync", sync::router())
        .nest("/console", console::router())
        .nest("/admin", admin::router())
        .layer(server_log_layer)
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state)
}

fn cors_layer(state: &AppState) -> CorsLayer {
    #[cfg_attr(not(debug_assertions), allow(unused_mut))]
    let mut origins = state
        .config
        .cors_origin
        .as_deref()
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|origin| !origin.is_empty())
        .map(|origin| {
            origin
                .parse::<HeaderValue>()
                .expect("LOCKPASS_CORS_ORIGIN must contain valid HTTP origins")
        })
        .collect::<Vec<_>>();

    #[cfg(debug_assertions)]
    {
        for origin in default_dev_cors_origins() {
            if !origins.contains(&origin) {
                origins.push(origin);
            }
        }
    }
    let allow_origin = AllowOrigin::list(origins);

    CorsLayer::new()
        .allow_origin(allow_origin)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
}

#[cfg(debug_assertions)]
fn default_dev_cors_origins() -> [HeaderValue; 11] {
    [
        HeaderValue::from_static("http://127.0.0.1:1432"),
        HeaderValue::from_static("http://localhost:1432"),
        HeaderValue::from_static("http://127.0.0.1:1431"),
        HeaderValue::from_static("http://localhost:1431"),
        HeaderValue::from_static("http://127.0.0.1:1430"),
        HeaderValue::from_static("http://localhost:1430"),
        HeaderValue::from_static("http://127.0.0.1:5173"),
        HeaderValue::from_static("http://localhost:5173"),
        HeaderValue::from_static("http://127.0.0.1:5174"),
        HeaderValue::from_static("http://localhost:5174"),
        HeaderValue::from_static("http://tauri.localhost"),
    ]
}

async fn health(State(state): State<AppState>) -> Json<crate::model::HealthResponse> {
    Json(state.health().await)
}

pub(crate) fn auth_principal(state: &AppState, headers: &HeaderMap) -> AppResult<AuthPrincipal> {
    auth_principal_with_client_ip(state, headers, None)
}

pub(crate) fn auth_principal_with_client_ip(
    state: &AppState,
    headers: &HeaderMap,
    connect_info: Option<&ConnectInfo<SocketAddr>>,
) -> AppResult<AuthPrincipal> {
    let token = bearer_token(headers)?;
    state
        .store
        .authenticate_bearer(token, client_ip(headers, connect_info))
}

pub(crate) fn ensure_admin(principal: &AuthPrincipal) -> AppResult<()> {
    if principal.roles.iter().any(|role| rbac::is_admin_role(role)) {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

pub(crate) fn ok() -> Json<Value> {
    Json(json!({ "ok": true }))
}

fn bearer_token(headers: &HeaderMap) -> AppResult<&str> {
    let value = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .ok_or(AppError::Unauthorized)?;
    value
        .strip_prefix("Bearer ")
        .filter(|token| !token.trim().is_empty())
        .ok_or(AppError::Unauthorized)
}

pub(crate) fn client_ip(
    headers: &HeaderMap,
    connect_info: Option<&ConnectInfo<SocketAddr>>,
) -> Option<String> {
    headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|value| value.to_str().ok())
                .map(str::trim)
                .filter(|value| !value.is_empty())
        })
        .map(ToOwned::to_owned)
        .or_else(|| connect_info.map(|ConnectInfo(addr)| addr.ip().to_string()))
}
