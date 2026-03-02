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

# Python deps: add minimal build deps so PyAV can compile, then remove them to keep image small.
RUN apk add --no-cache pkgconfig build-base python3-dev ffmpeg-dev \
    && pip3 install --break-system-packages --no-cache-dir faster_whisper \
    && apk del pkgconfig build-base python3-dev ffmpeg-dev

CMD ["node", "worker.js"]
