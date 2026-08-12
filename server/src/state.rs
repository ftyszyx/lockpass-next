use std::{path::Path, sync::Arc};

use chrono::Utc;
use sqlx::migrate::Migrator;
use sqlx::{postgres::PgPoolOptions, PgPool};
use tracing::info;

use crate::{
    config::Config,
    error::{AppError, AppResult},
    mailer::Mailer,
    model::HealthResponse,
    storage::AppStore,
};

const SERVER_VERSION: &str = match option_env!("LOCKPASS_BUILD_VERSION") {
    Some(version) => version,
    None => env!("CARGO_PKG_VERSION"),
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub mailer: Mailer,
    pub store: AppStore,
    pg_pool: PgPool,
    started_at: chrono::DateTime<Utc>,
}

impl AppState {
    pub async fn new(config: Config) -> AppResult<Self> {
        let database_url = config.database_url.clone().ok_or_else(|| {
            AppError::Internal(
                "DATABASE_URL is required; PostgreSQL storage must be configured".to_string(),
            )
        })?;

        info!("connecting to PostgreSQL database");
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(&database_url)
            .await
            .map_err(|error| {
                AppError::Internal(format!(
                    "database connection failed; check DATABASE_URL and make sure PostgreSQL is running: {error}"
                ))
            })?;
        info!("PostgreSQL database connected");
        let migrations_dir = Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/migrations"));
        info!("running database migrations");
        let mut migrator = Migrator::new(migrations_dir).await?;
        migrator.set_ignore_missing(true);
        migrator.run(&pool).await?;
        info!("database migrations completed");

        let mailer = Mailer;
        let store = AppStore::new(pool.clone());
        info!("initializing application storage");
        store.initialize().await?;
        if store.account_count().await? == 0 {
            if let Some(admin) = config.bootstrap_admin.as_ref() {
                store.create_bootstrap_admin(&admin.username, &admin.password)?;
                info!("bootstrap admin account created");
            }
        }
        info!("application storage initialized");

        Ok(Self {
            config: Arc::new(config),
            mailer,
            store,
            pg_pool: pool,
            started_at: Utc::now(),
        })
    }

    pub async fn health(&self) -> HealthResponse {
        let database = match sqlx::query_scalar::<_, i32>("select 1")
            .fetch_one(&self.pg_pool)
            .await
        {
            Ok(_) => "connected",
            Err(_) => "unavailable",
        };

        HealthResponse {
            status: "ok".to_string(),
            version: SERVER_VERSION.to_string(),
            storage: "postgres".to_string(),
            database: database.to_string(),
            started_at: self.started_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_version_is_available() {
        assert!(!SERVER_VERSION.trim().is_empty());
        match option_env!("LOCKPASS_BUILD_VERSION") {
            Some(version) => assert_eq!(SERVER_VERSION, version),
            None => assert_eq!(SERVER_VERSION, env!("CARGO_PKG_VERSION")),
        }
    }
}
