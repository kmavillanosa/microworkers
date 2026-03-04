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
  | **VPS_API_URL** (or API_BASE_URL) | Yes | URL the worker can reach. Prefer **`https://reelagad.com`** (API behind nginx; no port). Or `https://vps-ip:3010` if API is exposed; or `https://api:3000` when worker runs in same Docker network as API. |
  | **REPO_ROOT** | Yes (if not default) | Path to repo root on the local machine (so the worker can run `reels_generator.py` and use `output/`, `assets/`, etc.). Default: parent of worker dir. |
  | **WORKER_SECRET** | Optional | If set on both VPS API and worker, worker sends `X-Worker-Secret` header; API rejects requests without it. |
  | **REELS_PYTHON_EXE** | Optional | Path to Python (default: `REPO_ROOT/.reels-venv/bin/python` or `Scripts/python.exe` on Windows). |
  | **POLL_MS** | Optional | Poll interval in ms (default 15000). |

- **Compose:** In `docker-compose.local.yml` under the **`workers`** profile. Set **VPS_API_URL** in `.env.local` (e.g. `VPS_API_URL=https://reelagad.com`).
- **Run:** `docker compose -f docker-compose.local.yml --profile workers up -d` (with repo mounted), or on your host: `cd workers/reels-generator && VPS_API_URL=https://reelagad.com node worker.js`.
- **"Poll error: fetch failed":** The worker cannot reach the API. Use **`VPS_API_URL=https://reelagad.com`** so requests go through your domain (nginx → frontend → API). Do not use `localhost:3010` from inside a container (localhost is the container, not the host).
- **"Poll failed: 401" or "Claim failed: 401":** The API expects **WORKER_SECRET**. Set the same value in the worker env (and in the API env). If the API has no WORKER_SECRET, leave it unset in the worker.
