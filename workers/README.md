# Workers (separate Docker services)

## Transcription (`workers/transcription`)

- **Runs:** Online (deployed with API + web-orders).
- **Role:** Polls MySQL for order clips with `transcript_status='pending'`, runs `transcribe_clip.py`, updates `clips` and `orders`.
- **API:** Set **`RUN_TRANSCRIPTION_IN_API=false`** in the API so it does not run transcription in-process (deploy compose sets this).
- **Compose:** Included in `docker-compose.deploy.yml` and `docker-compose.local.yml`.

## Reels generator (`workers/reels-generator`)

- **Runs:** **Local only** (heavy CPU). Generate reels on your machine; output is uploaded to the VPS so the **customer** sees it on their receipt (web-orders loads from VPS API).
- **Role:** Polls the **VPS API** for queued reel jobs, claims a job, runs `reels_generator.py` locally, then uploads video/srt/txt/audio to the VPS. The VPS stores the output and marks the order ready; the customer sees the reel on the order receipt.
- **API URLs:** **Web-orders** → **VPS API URL**. **Backoffice** (generate/process orders) → **local API URL** (local API must use VPS MySQL). **Worker** → **VPS API URL** (poll + upload).
- **VPS API:** On the server, set **`REELS_RUN_IN_PROCESS=false`** so the API only queues jobs. Jobs are created when you click “Process” in the backoffice (which talks to your **local** API; local API writes the job to VPS MySQL).
- **Local worker env:**

  | Variable | Required | Description |
  |----------|----------|-------------|
  | **VPS_API_URL** (or API_BASE_URL) | Yes | URL of the VPS API (e.g. `https://api.yourdomain.com` or `http://vps-ip:3010`). Worker polls and uploads here. |
  | **REPO_ROOT** | Yes (if not default) | Path to repo root on the local machine (so the worker can run `reels_generator.py` and use `output/`, `assets/`, etc.). Default: parent of worker dir. |
  | **WORKER_SECRET** | Optional | If set on both VPS API and worker, worker sends `X-Worker-Secret` header; API rejects requests without it. |
  | **REELS_PYTHON_EXE** | Optional | Path to Python (default: `REPO_ROOT/.reels-venv/bin/python` or `Scripts/python.exe` on Windows). |
  | **POLL_MS** | Optional | Poll interval in ms (default 15000). |

- **Compose:** In `docker-compose.local.yml` under the **`workers`** profile. When running the worker against a **remote** VPS, set **VPS_API_URL** to your VPS API URL (e.g. in `.env.local`: `VPS_API_URL=https://api.yourdomain.com`).
- **Run:** `docker compose -f docker-compose.local.yml --profile workers up -d` (with repo mounted so Python and `reels_generator.py` are available), or on your host: `cd workers/reels-generator && VPS_API_URL=https://your-vps-api node worker.js`.
