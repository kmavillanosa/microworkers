# Transcription worker: runs transcribe_clip.py for order clips (separate service, online).
# Needs Python + faster_whisper; shares repo root for assets/order-clips and script.
FROM node:20-alpine

RUN apk add --no-cache python3 py3-pip ffmpeg

WORKDIR /app

# Install Node deps
COPY workers/transcription/package.json workers/transcription/package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy worker script only. Repo root (transcribe_clip.py, assets/order-clips) is mounted at runtime.
COPY workers/transcription/worker.js ./

# Default: compose mounts repo at /data so assets/order-clips and transcribe_clip.py exist
ENV REPO_ROOT=/data
ENV REELS_PYTHON_EXE=/usr/bin/python3

# No faster_whisper install here: PyAV/faster_whisper often fail to build on Alpine.
# transcribe_clip.py will exit with a clear JSON error; worker marks clip failed and user can enter script manually.

CMD ["node", "worker.js"]
