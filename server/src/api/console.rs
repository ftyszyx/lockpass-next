use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::{delete, get},
    Json, Router,
};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    api::{auth_principal, ok},
    error::AppResult,
    model::ProfilePatchRequest,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/profile", get(profile).patch(update_profile))
        .route("/identities", get(identities))
        .route("/identities/:id", delete(delete_identity))
        .route("/devices", get(devices))
        .route("/devices/:id", delete(delete_device))
        .route("/usage", get(usage))
        .route("/sync-data", get(sync_data))
}

async fn profile(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    Ok(Json(json!(state.store.profile(principal.account_id)?)))
}

async fn update_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ProfilePatchRequest>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    Ok(Json(json!(state.store.update_profile(
        principal.account_id,
        payload.display_name
    )?)))
}

async fn identities(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    Ok(Json(json!(state.store.identities(principal.account_id)?)))
}

async fn delete_identity(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(identity_id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    state
        .store
        .delete_identity(principal.account_id, identity_id)?;
    Ok(ok())
}

async fn devices(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    Ok(Json(json!(state
        .store
        .list_devices(principal.account_id)?)))
}

async fn delete_device(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(device_id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    state.store.revoke_device(principal.account_id, device_id)?;
    Ok(ok())
}

async fn usage(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    Ok(Json(json!(state.store.usage(principal.account_id)?)))
}

async fn sync_data(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    Ok(Json(state.store.account_sync_data(principal.account_id)?))
}
