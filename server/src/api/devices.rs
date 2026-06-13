use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::{get, patch},
    Json, Router,
};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    api::{auth_principal, ok},
    error::AppResult,
    model::DeviceRemarkPatchRequest,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_devices))
        .route("/:id", patch(rename_device).delete(revoke_device))
}

async fn list_devices(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    Ok(Json(json!(state
        .store
        .list_devices(principal.account_id)?)))
}

async fn rename_device(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(device_id): Path<Uuid>,
    Json(payload): Json<DeviceRemarkPatchRequest>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    Ok(Json(json!(state.store.update_device_remark(
        principal.account_id,
        device_id,
        payload.remark
    )?)))
}

async fn revoke_device(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(device_id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    state.store.revoke_device(principal.account_id, device_id)?;
    Ok(ok())
}
