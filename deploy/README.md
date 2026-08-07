# LockPass self-hosting

The root `compose.yml` deploys PostgreSQL, the Rust API server, and one Caddy
gateway containing both web frontends. The gateway supports two explicit
deployment modes.

## Local mode

Local mode uses plain HTTP and does not require DNS or certificates:

- `http://localhost`: user Web UI and API
- `http://localhost:8081`: administrator UI

Copy the local example and start the stack:

```bash
cp .env.deploy.example .env.deploy
docker compose --env-file .env.deploy config
docker compose --env-file .env.deploy up -d --build
```

Local mode binds all gateway ports to `127.0.0.1` and is intended for testing
on the Docker host itself. When changing a host port, update the corresponding
URL so browser redirects and CORS continue to match. Use production mode when
other devices need access; do not expose the local mode's unencrypted HTTP
endpoints to a LAN or the public internet.

## Production mode

Production mode requires two public DNS records pointing to the Docker host:

- `lockpass.example.com`: user Web UI and API
- `admin.lockpass.example.com`: administrator UI

Copy the production example, replace its URLs and credentials, then start the
same Compose stack:

```bash
cp .env.deploy.production.example .env.deploy
docker compose --env-file .env.deploy config
docker compose --env-file .env.deploy up -d --build
```

Production URLs must use `https://`. Caddy obtains and renews certificates
automatically after both DNS records resolve to the host and ports 80/443 are
reachable. The user Web UI and API intentionally share one origin. Desktop
self-hosted login opens that public URL as the account website.

## Logs

```bash
docker compose --env-file .env.deploy logs -f server gateway
```

The server runs database migrations during startup. The bootstrap administrator
is created only when the database contains no accounts.

## PostgreSQL configuration

Both deployment examples expose the PostgreSQL settings explicitly:

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_HOST` | `postgres` | Address used by the LockPass server inside the Compose network |
| `POSTGRES_PORT` | `5432` | PostgreSQL listening port inside the container and server connection port |
| `POSTGRES_HOST_PORT` | `5432` | Port published on the Docker host |
| `POSTGRES_BIND_ADDRESS` | `127.0.0.1` | Host interface allowed to access the published database port |
| `POSTGRES_DB` | `lockpass` | Database name |
| `POSTGRES_USER` | `lockpass` | Database user |
| `POSTGRES_PASSWORD` | required | Database password |

Keep `POSTGRES_HOST=postgres` when using the bundled database container. The
host port is intended for local administration and backup tools and is bound
to loopback by default. Do not change `POSTGRES_BIND_ADDRESS` to `0.0.0.0`
unless database access is protected by a firewall and a trusted network.

`POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` initialize an empty
PostgreSQL data directory. Changing them after the `postgres-data` volume has
already been created does not rename the existing database or user.

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
`ftyszyx752/lockpass-gateway`. Configure both repository variables:

- `LOCKPASS_PUBLIC_URL`: production user Web/API origin, for example `https://lockpass.example.com`
- `LOCKPASS_ADMIN_URL`: production administrator origin, for example `https://admin.lockpass.example.com`

A manual workflow run can override them with the `public_url` and `admin_url`
inputs. Both origins are stored as the gateway image's production defaults.
Runtime environment variables may still override
`LOCKPASS_DEPLOY_MODE`, `LOCKPASS_PUBLIC_URL`, and `LOCKPASS_ADMIN_URL`.
