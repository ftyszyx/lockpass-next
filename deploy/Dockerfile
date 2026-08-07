FROM node:22-alpine AS frontend-builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci

ARG VITE_LOCKPASS_OFFICIAL_SERVER_URL
ARG VITE_LOCKPASS_OFFICIAL_API_URL
ARG VITE_LOCKPASS_API_BASE_URL

ENV VITE_LOCKPASS_OFFICIAL_SERVER_URL=${VITE_LOCKPASS_OFFICIAL_SERVER_URL}
ENV VITE_LOCKPASS_OFFICIAL_API_URL=${VITE_LOCKPASS_OFFICIAL_API_URL}
ENV VITE_LOCKPASS_API_BASE_URL=${VITE_LOCKPASS_API_BASE_URL}

RUN test -n "${VITE_LOCKPASS_OFFICIAL_SERVER_URL}" \
    && test -n "${VITE_LOCKPASS_OFFICIAL_API_URL}" \
    && test -n "${VITE_LOCKPASS_API_BASE_URL}" \
    && npm run build:web \
    && npm run build:admin_web

FROM caddy:2-alpine AS gateway

ARG LOCKPASS_DEPLOY_MODE=local
ARG LOCKPASS_PUBLIC_URL=http://localhost
ARG LOCKPASS_ADMIN_URL=http://localhost:8081

ENV LOCKPASS_DEPLOY_MODE=${LOCKPASS_DEPLOY_MODE}
ENV LOCKPASS_PUBLIC_URL=${LOCKPASS_PUBLIC_URL}
ENV LOCKPASS_ADMIN_URL=${LOCKPASS_ADMIN_URL}

COPY deploy/Caddyfile /etc/caddy/Caddyfile.production
COPY deploy/Caddyfile.local /etc/caddy/Caddyfile.local
COPY deploy/gateway-entrypoint.sh /usr/bin/lockpass-gateway-entrypoint
COPY --from=frontend-builder /app/apps/web/dist /srv/web
COPY --from=frontend-builder /app/apps/admin_web/dist /srv/admin_web

RUN chmod +x /usr/bin/lockpass-gateway-entrypoint

EXPOSE 80 443 8081

ENTRYPOINT ["/usr/bin/lockpass-gateway-entrypoint"]
