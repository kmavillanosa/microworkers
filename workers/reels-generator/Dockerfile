# Reels generator worker: runs video generation locally (heavy CPU).
# Repo root is mounted at /data so reels_generator.py and assets/ are available.
# Full implementation: poll API for queued jobs, run reels_generator.py, report back.
FROM node:20-alpine

WORKDIR /app

COPY workers/reels-generator/package.json workers/reels-generator/package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
COPY workers/reels-generator/worker.js ./

ENV API_BASE_URL=http://api:3000
ENV REPO_ROOT=/data

CMD ["node", "worker.js"]
