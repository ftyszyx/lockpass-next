use std::{path::Path, sync::Arc};

use chrono::Utc;
use sqlx::migrate::Migrator;
use sqlx::{postgres::PgPoolOptions, PgPool};
use tracing::info;

use crate::{
    config::Config,
    error::{AppError, AppResult},
    model::HealthResponse,
    storage::AppStore,
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
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

        let store = AppStore::new(pool.clone());
        info!("initializing application storage");
        store.initialize().await?;
        info!("application storage initialized");

        Ok(Self {
            config: Arc::new(config),
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
            version: env!("CARGO_PKG_VERSION").to_string(),
            storage: "postgres".to_string(),
            database: database.to_string(),
            started_at: self.started_at,
        }
    }
}
