# LockPass self-hosting

The root `compose.yml` deploys PostgreSQL, the Rust API server, and one Caddy
gateway containing both web frontends.

## Domains

Create two DNS records pointing to the Docker host:

- `lockpass.example.com`: user Web UI and API
- `admin.lockpass.example.com`: administrator UI

The user Web UI and API intentionally share one origin. Desktop self-hosted
login opens the configured API URL as the account website.

## Start

Copy `.env.deploy.example` to a private environment file and replace every
example credential and domain.

```bash
docker compose --env-file .env.deploy config
docker compose --env-file .env.deploy up -d --build
docker compose --env-file .env.deploy logs -f server
```

Caddy obtains and renews HTTPS certificates automatically after both DNS
records resolve to the host and ports 80/443 are reachable.

The server runs database migrations during startup. The bootstrap administrator
is created only when the database contains no accounts.

## Update

```bash
git pull
docker compose --env-file .env.deploy up -d --build
```

## Backup

Back up PostgreSQL and the Compose environment file. The Caddy volumes contain
TLS state and may also be included in host backups.

```bash
docker compose --env-file .env.deploy exec -T postgres \
  pg_dump -U lockpass -d lockpass > lockpass.sql
```

## Stop

```bash
docker compose --env-file .env.deploy down
```

Do not add `-v` unless the PostgreSQL and Caddy volumes should also be deleted.

## GitHub Actions image

The `docker-server.yml` workflow also publishes the gateway image as
`ftyszyx752/lockpass-gateway`. Set the repository variable
`LOCKPASS_PUBLIC_URL` to the production user Web/API origin, for example
`https://lockpass.example.com`. A manual workflow run can override it with the
`public_url` input.
