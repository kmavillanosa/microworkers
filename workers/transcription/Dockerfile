# Transcription worker: runs transcribe_clip.py for order clips (separate service, online).
# Needs Python + faster_whisper; shares repo root for assets/order-clips and script.
# Debian base: pip can use manylinux wheels for PyAV/faster_whisper; Alpine often fails to build them.
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    ffmpeg \
    pkg-config \
    libavformat-dev \
    libavcodec-dev \
    libavdevice-dev \
    libavutil-dev \
    libswscale-dev \
    libswresample-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node deps
COPY workers/transcription/package.json workers/transcription/package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy worker script only. Repo root (transcribe_clip.py, assets/order-clips) is mounted at runtime.
COPY workers/transcription/worker.js ./

# Default: compose mounts repo at /data so assets/order-clips and transcribe_clip.py exist
ENV REPO_ROOT=/data
ENV REELS_PYTHON_EXE=/usr/bin/python3

# Python deps for transcribe_clip.py
RUN pip3 install --break-system-packages --no-cache-dir faster_whisper

CMD ["node", "worker.js"]
