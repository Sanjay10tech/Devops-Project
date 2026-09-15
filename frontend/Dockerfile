# syntax=docker/dockerfile:1

###############################################################################
# Frontend production image (React + Vite -> static assets served by Nginx)
# Multi-stage build:
#   1) deps  - install deps (cached on package files only)
#   2) build - produce static assets in /app/dist
#   3) nginx - unprivileged Nginx serving the SPA + proxying /api
###############################################################################

ARG NODE_VERSION=20.17.0
ARG NGINX_VERSION=1.27-alpine

# ---- deps -------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Prefer reproducible `npm ci` when a lockfile is present; fall back to install.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---- build ------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json vite.config.ts index.html ./
COPY src ./src
# Build-time API base. Empty default = use relative /api/v1 (proxied by Nginx).
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# ---- nginx runtime (unprivileged, non-root, listens on 8080) ----------------
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION} AS nginx

# Backend upstream is templated into the config at container start.
# Only BACKEND_URL is substituted so Nginx's own $variables are preserved.
ENV BACKEND_URL=http://backend:4000 \
    NGINX_ENVSUBST_FILTER=BACKEND_URL

# Config template (processed by the base image entrypoint via envsubst).
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Static assets from the build stage.
COPY --from=build /app/dist /usr/share/nginx/html

# Image already runs as the non-root 'nginx' user (uid 101) and listens on 8080.
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "-qO-", "http://127.0.0.1:8080/healthz"]
