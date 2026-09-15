# syntax=docker/dockerfile:1

###############################################################################
# Backend production image (Node.js + TypeScript)
# Multi-stage build:
#   1) deps    - install ALL deps (cached on package files only)
#   2) build   - compile TypeScript to dist/
#   3) runtime - minimal image with prod deps + compiled output, non-root
###############################################################################

# Pin a specific minor + digest-friendly tag for reproducibility.
ARG NODE_VERSION=20.17.0

# ---- deps: install all dependencies (dev + prod) for building ---------------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
# Copy only manifests first so this layer is cached unless deps change.
COPY package.json package-lock.json* ./
# Prefer reproducible `npm ci` when a lockfile is present; fall back to install.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---- build: compile TypeScript --------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- prod-deps: install only production dependencies -----------------------
FROM node:${NODE_VERSION}-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
    && npm cache clean --force

# ---- runtime: minimal image, non-root --------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# dumb-init for correct signal handling (PID 1) and reaping.
RUN apk add --no-cache dumb-init

# Copy production node_modules and compiled output.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY healthcheck.js ./

# SQL migrations/seeds are mounted at runtime (see docker-compose migrate service)
# and located via MIGRATIONS_DIR / SEED_FILE. Defaults point at a mount path.
ENV MIGRATIONS_DIR=/app/database/migrations \
    SEED_FILE=/app/database/seeds/seed.sql

# The 'node' user (uid 1000) ships with the official image. Run as non-root.
USER node

EXPOSE 4000

# Liveness health check hitting /health (no curl needed; uses Node).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "healthcheck.js"]

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
