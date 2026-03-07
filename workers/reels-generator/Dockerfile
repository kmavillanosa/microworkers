# Reels generator worker: runs video generation locally (heavy CPU).
# Repo root is mounted at /data so reels_generator.py and assets/ are available.
# Python + deps are installed here so the worker can run reels_generator.py inside the container.
FROM node:20-bullseye-slim

WORKDIR /app

# Python + ffmpeg + reels deps (same as API so reels_generator.py runs)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg \
  && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /app/requirements.txt
RUN pip3 install --no-cache-dir -r /app/requirements.txt

# Node worker
COPY workers/reels-generator/package.json workers/reels-generator/package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
COPY workers/reels-generator/worker.js workers/reels-generator/run-generator.js ./

ENV VPS_API_URL=https://reelagad.com
ENV API_BASE_URL=https://reelagad.com
ENV REPO_ROOT=/data
ENV REELS_PYTHON_EXE=/usr/bin/python3

CMD ["node", "worker.js"]
