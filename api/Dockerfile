# syntax=docker/dockerfile:1
# Build from repo root (docker-compose context: .) so we can COPY assets/fonts
# Build stage
FROM node:20-bullseye-slim AS builder

WORKDIR /app

COPY api/package.json api/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci

COPY api/ .
RUN npm run build

# Production stage
FROM node:20-bullseye-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
EXPOSE 3000

COPY requirements.txt /app/requirements.txt
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && pip3 install --no-cache-dir -r /app/requirements.txt \
  && rm -rf /var/lib/apt/lists/*

COPY api/package.json api/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Data dir and assets: fonts baked in so container has them without a mount
RUN mkdir -p /app/data/assets/db /app/data/assets/credentials \
  /app/data/assets/order-clips /app/data/assets/cache/images \
  /app/data/assets/voices/piper /app/data/output /app/data/assets/fonts \
  && chown -R node:node /app/data

COPY assets/fonts/ /app/data/assets/fonts/
RUN chown -R node:node /app/data/assets/fonts

ENV REPO_ROOT=/app/data

USER node
CMD ["node", "dist/main.js"]
