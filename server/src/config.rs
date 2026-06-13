use std::{env, net::SocketAddr};

#[derive(Clone, Debug)]
pub struct Config {
    pub listen_addr: SocketAddr,
    pub database_url: Option<String>,
    pub cors_origin: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        let manifest_env = concat!(env!("CARGO_MANIFEST_DIR"), "/.env");
        if dotenvy::from_path(manifest_env).is_err() {
            let _ = dotenvy::dotenv();
        }

        let listen_addr = env::var("LOCKPASS_SERVER_ADDR")
            .unwrap_or_else(|_| "127.0.0.1:1480".to_string())
            .parse()
            .expect("LOCKPASS_SERVER_ADDR must be a socket address, for example 127.0.0.1:1480");

        Self {
            listen_addr,
            database_url: env::var("DATABASE_URL")
                .ok()
                .filter(|value| !value.is_empty()),
            cors_origin: env::var("LOCKPASS_CORS_ORIGIN")
                .ok()
                .filter(|value| !value.is_empty()),
        }
    }
}
