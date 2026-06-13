use axum::{
    extract::{Query, State},
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};

use crate::{
    api::{auth_principal, ok},
    error::AppResult,
    model::{
        SyncAckRequest, SyncPullQuery, SyncPushRequest, SyncSnapshotQuery, SyncSpaceCreateRequest,
        WrappedVaultKeyCreateRequest, WrappedVaultKeyQuery,
    },
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/spaces", get(list_spaces).post(create_space))
        .route(
            "/wrapped-vault-keys",
            get(list_wrapped_vault_keys).post(create_wrapped_vault_key),
        )
        .route("/snapshot", get(snapshot))
        .route("/push", post(push))
        .route("/pull", get(pull))
        .route("/ack", post(ack))
}

async fn list_spaces(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    Ok(Json(json!(state.store.list_sync_spaces(&principal)?)))
}

async fn create_space(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SyncSpaceCreateRequest>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    Ok(Json(json!(state.store.create_sync_space(
        &principal,
        payload.display_name,
        payload.encrypted_metadata
    )?)))
}

async fn list_wrapped_vault_keys(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<WrappedVaultKeyQuery>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    Ok(Json(json!(state.store.list_wrapped_vault_keys(
        &principal,
        query.sync_space_id
    )?)))
}

async fn create_wrapped_vault_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<WrappedVaultKeyCreateRequest>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    Ok(Json(json!(state
        .store
        .create_wrapped_vault_key(&principal, payload)?)))
}

async fn snapshot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SyncSnapshotQuery>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    Ok(Json(json!(state.store.sync_snapshot(&principal, query)?)))
}

async fn push(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SyncPushRequest>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    Ok(Json(json!(state.store.push_sync_objects(
        &principal,
        payload.client_batch_id,
        payload.objects
    )?)))
}

async fn pull(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SyncPullQuery>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    Ok(Json(json!(state.store.pull_sync_events(
        &principal,
        query.cursor.unwrap_or(0),
        query.limit.unwrap_or(200)
    )?)))
}

async fn ack(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SyncAckRequest>,
) -> AppResult<Json<Value>> {
    let principal = auth_principal(&state, &headers)?;
    state.store.ack_sync_cursor(&principal, payload.cursor)?;
    Ok(ok())
}
