#!/usr/bin/env sh
set -eu

docker compose -f docker-compose.yml pull server
docker compose -f docker-compose.yml up -d --force-recreate server
