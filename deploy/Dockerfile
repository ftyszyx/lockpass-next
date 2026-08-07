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

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend-builder /app/apps/web/dist /srv/web
COPY --from=frontend-builder /app/apps/admin_web/dist /srv/admin_web

EXPOSE 80 443
