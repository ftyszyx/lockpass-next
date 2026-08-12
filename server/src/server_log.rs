use std::{
    net::SocketAddr,
    sync::atomic::{AtomicU64, Ordering},
    time::Instant,
};

use axum::{
    extract::{ConnectInfo, Request, State},
    http::{header, HeaderMap, Method, StatusCode},
    middleware::Next,
    response::Response,
};
use uuid::Uuid;

use crate::{api::client_ip, model::ServerLogEntry, state::AppState};

const SERVER_LOG_PRUNE_INTERVAL: u64 = 1_000;
static SERVER_LOG_WRITE_COUNT: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug)]
pub struct ServerLogErrorContext {
    pub code: &'static str,
    pub message: String,
}

pub async fn capture_server_log(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    if !should_capture(&method, &path) {
        return next.run(request).await;
    }

    let request_id = Uuid::new_v4();
    let token_hash =
        bearer_token(request.headers()).map(|token| state.store.server_log_token_hash(token));
    let remote_addr = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .cloned();
    let request_client_ip = client_ip(request.headers(), remote_addr.as_ref());
    let started_at = Instant::now();
    let mut response = next.run(request).await;
    let status = response.status();
    let error_context = response
        .extensions()
        .get::<ServerLogErrorContext>()
        .cloned();

    response.headers_mut().insert(
        "x-request-id",
        request_id
            .to_string()
            .parse()
            .expect("UUID is a valid HTTP header value"),
    );

    let entry = ServerLogEntry {
        request_id,
        level: level_for_status(status).to_string(),
        message: log_message(&method, &path, status, error_context.as_ref()),
        token_hash,
        method: method.to_string(),
        path,
        status_code: i32::from(status.as_u16()),
        duration_ms: duration_millis(started_at),
        client_ip: request_client_ip,
    };
    let store = state.store.clone();
    tokio::spawn(async move {
        if let Err(error) = store.append_server_log(entry).await {
            tracing::error!(%error, "failed to persist server request log");
            return;
        }
        if should_prune_server_logs() {
            if let Err(error) = store.prune_server_logs().await {
                tracing::warn!(%error, "failed to prune server request logs");
            }
        }
    });

    response
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn level_for_status(status: StatusCode) -> &'static str {
    if status.is_server_error() {
        "error"
    } else if status.is_client_error() {
        "warning"
    } else {
        "info"
    }
}

fn should_capture(method: &Method, path: &str) -> bool {
    method != Method::OPTIONS && path != "/health" && path != "/admin/server-logs"
}

fn duration_millis(started_at: Instant) -> i64 {
    started_at.elapsed().as_millis().min(i64::MAX as u128) as i64
}

fn should_prune_server_logs() -> bool {
    SERVER_LOG_WRITE_COUNT.fetch_add(1, Ordering::Relaxed) % SERVER_LOG_PRUNE_INTERVAL == 0
}

fn log_message(
    method: &Method,
    path: &str,
    status: StatusCode,
    error_context: Option<&ServerLogErrorContext>,
) -> String {
    match error_context {
        Some(context) => format!(
            "{} {} returned {} [{}]: {}",
            method,
            path,
            status.as_u16(),
            context.code,
            compact_message(&context.message)
        ),
        None => format!("{} {} returned {}", method, path, status.as_u16()),
    }
}

fn compact_message(message: &str) -> String {
    message
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(1000)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_http_status_to_log_level() {
        assert_eq!(level_for_status(StatusCode::OK), "info");
        assert_eq!(level_for_status(StatusCode::BAD_REQUEST), "warning");
        assert_eq!(level_for_status(StatusCode::INTERNAL_SERVER_ERROR), "error");
    }

    #[test]
    fn skips_noise_and_server_log_queries() {
        assert!(!should_capture(&Method::OPTIONS, "/sync/pull"));
        assert!(!should_capture(&Method::GET, "/health"));
        assert!(!should_capture(&Method::GET, "/admin/server-logs"));
        assert!(should_capture(&Method::POST, "/sync/push"));
    }

    #[test]
    fn compacts_error_messages() {
        assert_eq!(
            compact_message("SMTP\n connection   failed"),
            "SMTP connection failed"
        );
    }
}
