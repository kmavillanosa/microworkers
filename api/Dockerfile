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
RUN --mount=type=cache,target=/root/.cache/pip \
  apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip openssl \
  && pip3 install -r /app/requirements.txt \
  && rm -rf /var/lib/apt/lists/*

# Default self-signed cert so API can serve HTTPS (override by mounting real certs at /app/ssl)
RUN mkdir -p /app/ssl \
  && openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /app/ssl/privkey.pem \
  -out /app/ssl/fullchain.pem \
  -subj "/CN=localhost" \
  && chown -R node:node /app/ssl

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
# Serve HTTPS by default (self-signed cert above). Override with mount + SSL_CERT_PATH/SSL_KEY_PATH for real certs.
ENV SSL_CERT_PATH=/app/ssl/fullchain.pem
ENV SSL_KEY_PATH=/app/ssl/privkey.pem

USER node
CMD ["node", "dist/main.js"]
