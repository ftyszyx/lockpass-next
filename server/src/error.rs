use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    BadRequest(String),
    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Conflict(String),
    #[error("{message}")]
    ConflictCode { code: &'static str, message: String },
    #[error("{0}")]
    NotImplemented(String),
    #[error("{0}")]
    Internal(String),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    error: &'static str,
    message: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code) = match &self {
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, "bad_request"),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::Forbidden => (StatusCode::FORBIDDEN, "forbidden"),
            AppError::NotFound(_) => (StatusCode::NOT_FOUND, "not_found"),
            AppError::Conflict(_) => (StatusCode::CONFLICT, "conflict"),
            AppError::ConflictCode { code, .. } => (StatusCode::CONFLICT, *code),
            AppError::NotImplemented(_) => (StatusCode::NOT_IMPLEMENTED, "not_implemented"),
            AppError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
        };

        let message = self.to_string();
        (
            status,
            Json(ErrorBody {
                error: code,
                message,
            }),
        )
            .into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(error: sqlx::Error) -> Self {
        AppError::Internal(format!("database error: {error}"))
    }
}

impl From<sqlx::migrate::MigrateError> for AppError {
    fn from(error: sqlx::migrate::MigrateError) -> Self {
        AppError::Internal(format!("database migration error: {error}"))
    }
}

impl From<lockpass_server_auth::AuthError> for AppError {
    fn from(error: lockpass_server_auth::AuthError) -> Self {
        match error {
            lockpass_server_auth::AuthError::InvalidEmail
            | lockpass_server_auth::AuthError::WeakPassword { .. } => {
                AppError::BadRequest(error.to_string())
            }
            lockpass_server_auth::AuthError::RegistrationDisabled
            | lockpass_server_auth::AuthError::AccountDisabled => AppError::Forbidden,
            lockpass_server_auth::AuthError::DuplicateIdentity => {
                AppError::Conflict(error.to_string())
            }
            lockpass_server_auth::AuthError::InvalidCredentials
            | lockpass_server_auth::AuthError::MissingPasswordCredential
            | lockpass_server_auth::AuthError::PasswordMismatch => AppError::Unauthorized,
            lockpass_server_auth::AuthError::PasswordHash(_) => {
                AppError::Internal(error.to_string())
            }
            lockpass_server_auth::AuthError::Store(_) => AppError::Internal(error.to_string()),
        }
    }
}
