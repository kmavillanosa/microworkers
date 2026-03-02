# Transcription worker: runs transcribe_clip.py for order clips (separate service, online).
# Debian base so pip can use manylinux wheels for PyAV/faster_whisper (avoids Alpine build failures).
# Build can take several minutes; deploy workflow uses a longer timeout and SSH keepalive.
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

ENV REPO_ROOT=/data
ENV REELS_PYTHON_EXE=/usr/bin/python3

# faster-whisper: local-only transcription, free, no API, no payments (CTranslate2 + Whisper)
RUN pip3 install --break-system-packages --no-cache-dir faster_whisper

CMD ["node", "worker.js"]
