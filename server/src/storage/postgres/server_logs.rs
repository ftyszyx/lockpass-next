use chrono::Utc;
use sqlx::{postgres::PgRow, Row};

use super::{run_blocking, PostgresStore};
use crate::{
    error::{AppError, AppResult},
    model::{AdminServerLogQuery, ServerLogEntry, ServerLogListResponse, ServerLogView},
};

const SERVER_LOG_RETENTION_DAYS: i64 = 30;
const SERVER_LOG_MAX_ROWS: i64 = 200_000;

impl PostgresStore {
    pub fn server_log_token_hash(&self, token: &str) -> String {
        self.auth.secrets().hash(token)
    }

    pub async fn append_server_log(&self, entry: ServerLogEntry) -> AppResult<()> {
        sqlx::query(
            "with log_account as (\
               select a.id, a.display_name, a.email \
               from accounts a \
               join (\
                 select account_id from auth_sessions \
                 where token_hash = $1 and expires_at >= now() \
                 union all \
                 select account_id from devices \
                 where token_hash = $1 and revoked_at is null\
               ) authenticated on authenticated.account_id = a.id \
               where a.disabled_at is null \
               limit 1\
             ) \
             insert into server_logs \
               (request_id, level, message, account_id, account_display_name, account_email, method, path, status_code, duration_ms, client_ip, created_at) \
             select $2, $3, $4, log_account.id, log_account.display_name, log_account.email, $5, $6, $7, $8, $9, $10 \
             from (select 1) seed left join log_account on true",
        )
        .bind(entry.token_hash)
        .bind(entry.request_id)
        .bind(entry.level)
        .bind(entry.message)
        .bind(entry.method)
        .bind(entry.path)
        .bind(entry.status_code)
        .bind(entry.duration_ms)
        .bind(entry.client_ip)
        .bind(Utc::now())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn prune_server_logs(&self) -> AppResult<()> {
        sqlx::query(
            "delete from server_logs \
             where created_at < now() - ($1::bigint * interval '1 day')",
        )
        .bind(SERVER_LOG_RETENTION_DAYS)
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "delete from server_logs where id in (\
               select id from server_logs \
               order by created_at desc, id desc \
               offset $1\
             )",
        )
        .bind(SERVER_LOG_MAX_ROWS)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub fn admin_server_logs(
        &self,
        query: AdminServerLogQuery,
    ) -> AppResult<ServerLogListResponse> {
        let pool = self.pool.clone();
        let level = normalize_server_log_level(query.level)?;
        let account_id = query.account_id;
        let search = normalize_server_log_search(query.search);
        let page = query.page.unwrap_or(1).max(1);
        let page_size = query.page_size.unwrap_or(50).clamp(10, 100);
        let offset = (page - 1).saturating_mul(page_size);

        run_blocking(async move {
            let total = sqlx::query_scalar::<_, i64>(
                "select count(*) from server_logs \
                 where ($1::text is null or level = $1) \
                   and ($2::uuid is null or account_id = $2) \
                   and ($3::text is null or message ilike '%' || $3 || '%' or path ilike '%' || $3 || '%' or request_id::text ilike '%' || $3 || '%' or account_display_name ilike '%' || $3 || '%' or account_email ilike '%' || $3 || '%' or client_ip ilike '%' || $3 || '%')",
            )
            .bind(&level)
            .bind(account_id)
            .bind(&search)
            .fetch_one(&pool)
            .await?;

            let rows = sqlx::query(
                "select id, request_id, level, message, account_id, account_display_name, account_email, method, path, status_code, duration_ms, client_ip, created_at \
                 from server_logs \
                 where ($1::text is null or level = $1) \
                   and ($2::uuid is null or account_id = $2) \
                   and ($3::text is null or message ilike '%' || $3 || '%' or path ilike '%' || $3 || '%' or request_id::text ilike '%' || $3 || '%' or account_display_name ilike '%' || $3 || '%' or account_email ilike '%' || $3 || '%' or client_ip ilike '%' || $3 || '%') \
                 order by created_at desc, id desc limit $4 offset $5",
            )
            .bind(&level)
            .bind(account_id)
            .bind(&search)
            .bind(page_size)
            .bind(offset)
            .fetch_all(&pool)
            .await?;
            let logs = rows
                .into_iter()
                .map(row_to_server_log)
                .collect::<AppResult<Vec<_>>>()?;

            Ok(ServerLogListResponse {
                logs,
                total,
                page,
                page_size,
            })
        })
    }
}

fn row_to_server_log(row: PgRow) -> AppResult<ServerLogView> {
    Ok(ServerLogView {
        id: row.try_get("id")?,
        request_id: row.try_get("request_id")?,
        level: row.try_get("level")?,
        message: row.try_get("message")?,
        account_id: row.try_get("account_id")?,
        account_display_name: row.try_get("account_display_name")?,
        account_email: row.try_get("account_email")?,
        method: row.try_get("method")?,
        path: row.try_get("path")?,
        status_code: row.try_get("status_code")?,
        duration_ms: row.try_get("duration_ms")?,
        client_ip: row.try_get("client_ip")?,
        created_at: row.try_get("created_at")?,
    })
}

fn normalize_server_log_level(level: Option<String>) -> AppResult<Option<String>> {
    let level = level
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty());
    if level
        .as_deref()
        .is_some_and(|value| !matches!(value, "info" | "warning" | "error"))
    {
        return Err(AppError::BadRequest("invalid server log level".to_string()));
    }
    Ok(level)
}

fn normalize_server_log_search(search: Option<String>) -> Option<String> {
    search
        .map(|value| value.trim().chars().take(120).collect::<String>())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_server_log_level() {
        assert_eq!(
            normalize_server_log_level(Some("INFO".to_string())).unwrap(),
            Some("info".to_string())
        );
        assert!(normalize_server_log_level(Some("debug".to_string())).is_err());
        assert_eq!(
            normalize_server_log_level(Some(" ".to_string())).unwrap(),
            None
        );
    }
}
