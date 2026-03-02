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

# Python deps for transcribe_clip.py. imageio_ffmpeg is optional; script falls back to system ffmpeg.
RUN pip3 install --break-system-packages --no-cache-dir faster_whisper

CMD ["node", "worker.js"]
