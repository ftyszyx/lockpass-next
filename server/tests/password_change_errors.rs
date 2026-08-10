use axum::{body::to_bytes, http::StatusCode, response::IntoResponse};
use lockpass_sync_server::error::AppError;
use serde_json::Value;

#[tokio::test]
async fn current_password_error_has_specific_code() {
    let response = AppError::UnauthorizedCode {
        code: "current_password_incorrect",
        message: "current password is incorrect".to_string(),
    }
    .into_response();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        response_error_code(response).await,
        "current_password_incorrect"
    );
}

#[tokio::test]
async fn unchanged_password_error_has_specific_code() {
    let response = AppError::BadRequestCode {
        code: "password_unchanged",
        message: "new password must differ".to_string(),
    }
    .into_response();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(response_error_code(response).await, "password_unchanged");
}

async fn response_error_code(response: axum::response::Response) -> String {
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("error response body should be readable");
    let value: Value = serde_json::from_slice(&body).expect("error response should be JSON");
    value["error"]
        .as_str()
        .expect("error response should contain an error code")
        .to_string()
}
