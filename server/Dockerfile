FROM rust:1.88-bookworm AS builder

ARG APP_VERSION=0.1.0
ARG APP_IMAGE_NAME=ftyszyx752/lockpass
ARG APP_IMAGE_TAG=0.1.0
ARG APP_GIT_COMMIT=unknown
ARG APP_BUILD_TIME=unknown

ENV APP_VERSION=${APP_VERSION}
ENV APP_IMAGE_NAME=${APP_IMAGE_NAME}
ENV APP_IMAGE_TAG=${APP_IMAGE_TAG}
ENV APP_GIT_COMMIT=${APP_GIT_COMMIT}
ENV APP_BUILD_TIME=${APP_BUILD_TIME}

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY src ./src
COPY migrations ./migrations

RUN cargo build --release --locked

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/lockpass-sync-server /usr/local/bin/lockpass-sync-server
COPY --from=builder /app/migrations /app/migrations

ENV LOCKPASS_SERVER_ADDR=0.0.0.0:8080
EXPOSE 8080

CMD ["lockpass-sync-server"]
