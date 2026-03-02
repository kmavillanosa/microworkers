# Deploy: API + web-orders + transcription (CI/CD)

This doc describes deploying the **light** stack (API, web-orders, transcription) on the **VPS** and running the **web backoffice** and **video generator** **locally**. Customers use web-orders on the VPS; backoffice users use the backoffice on their local machine and trigger local reel generation; the output is uploaded to the VPS so the customer sees it on their receipt.

## Two APIs

There are **two API instances** in this setup:

| API | Where it runs | What it does |
|-----|----------------|--------------|
| **VPS API** | Deployed on the **VPS** (server) | Serves **web-orders**: customer uploads, orders, receipts. Stores orders in MySQL on VPS. Transcription worker runs on VPS; API does not run transcription in-process. Does **not** run reel generation (REELS_RUN_IN_PROCESS=false). Exposes worker endpoints so the **local** worker can poll for queued jobs and **upload** finished reel output. Customer sees the reel on the receipt page because the receipt is served from this VPS API. |
| **Local API** | Runs on **your machine** (local) | Serves the **web backoffice**. Backoffice user sees order requests (data comes from **VPS** because this API uses **VPS MySQL**). When the user clicks **Generate reel**, the backoffice calls **this local API**; the local API creates the reel job (writes to VPS MySQL). The local **reels-generator worker** then picks up the job (via VPS API), generates the video locally, and uploads the output to the **VPS API**. So: generate reel = local API + local worker; result is sent to VPS API so the customer gets it on the receipt. |

**Same data:** For the two APIs to have the **same data**, the **Local API** must connect to **VPS MySQL**. In `api/.env.local` (or the env you use for the Local API), set **TYPEORM_DATABASE_HOST** to your VPS host (e.g. your VPS IP or hostname) and **TYPEORM_DATABASE_PORT** to the port where MySQL is exposed on the VPS (e.g. **3307**). Use the same **TYPEORM_DATABASE_USERNAME**, **TYPEORM_DATABASE_PASSWORD**, and **TYPEORM_DATABASE_NAME** as on the VPS. Then both APIs read and write the same orders, jobs, and reel output. If you run the Local API via `docker-compose.local.yml`, override the DB connection (e.g. set **TYPEORM_DATABASE_HOST** and **TYPEORM_DATABASE_PORT** in your env or compose to your VPS MySQL) so the Local API uses VPS MySQL instead of the local `mysql` service.

## What gets deployed vs local

| Deployed (remote) | Local only |
|-------------------|------------|
| **API** (no transcription, no reel generation; jobs queued in DB) | **Web backoffice** |
| **web-orders**    | **Reels generator** (polls VPS, runs Python locally, uploads output) |
| **MySQL**         | |
| **Transcription** (separate Docker service) | |

- **CI/CD:** Use **`docker-compose.deploy.yml`** in your pipeline. It defines `mysql`, `api`, `web-orders`, and **`transcription`** (no `web` backoffice, no `reels-generator`).
- The API runs with **`RUN_TRANSCRIPTION_IN_API=false`** so it does not run `transcribe_clip.py` in-process; the **transcription** service picks up pending clips from the DB and runs transcription.
- The API runs with **`REELS_RUN_IN_PROCESS=false`** so it does **not** run the reel generator in-process; it only persists jobs to the DB. Your **local** reels-generator worker polls the VPS API, runs `reels_generator.py` on your machine, and uploads the output back to the VPS.
- **Pipeline example:** On push, build and deploy:
  ```bash
  docker compose -f docker-compose.deploy.yml --env-file .env.prod up -d --build
  ```
  (Adjust for your provider: e.g. build images, push to registry, then on the server pull and run with the same compose file.)

## API URLs: who uses which

| App | Points to | Purpose |
|-----|-----------|--------|
| **Web-orders** (customer site, on VPS) | **VPS API** (same server) | Customers place orders, pay, view receipt, download reels. All data lives on VPS. |
| **Web backoffice** (on your machine) | **Local API** (e.g. `http://localhost:3010`) | Backoffice loads order data (Local API reads from VPS MySQL). When user clicks **Generate reel**, the request goes to the **Local API**; Local API creates the job. |
| **Reels-generator worker** (on your machine) | **VPS API** (your VPS URL) | Worker polls **VPS API** for queued jobs, generates video locally, then uploads output to **VPS API**. Customer then sees the reel on the receipt (served by VPS API). |

When a video is generated and the worker uploads it to the VPS, the output is stored on the VPS API and in the same database. The customer sees the reel on their receipt (web-orders loads it from the VPS API).

## End-to-end flows

### Customer journey (web-orders — deployed on VPS)

1. Customer navigates to the **/orders** page (web-orders, served from VPS).
2. Customer **uploads** their file (video/clip).
3. Customer waits while the video is **uploaded → transcribed → processed → identified** (VPS API + transcription worker).
4. Customer gets the **script result** and can edit if needed.
5. Customer **proceeds with the order** (payment, details). Request is filed.
6. A **receipt page** is provided. When the reel is ready (after backoffice generates and it is uploaded to VPS), the **customer receives the output** on this receipt page (video, SRT, script, audio).

### Backoffice journey (web backoffice — deployed on local)

1. Backoffice user **receives the order request**; order data is loaded **from the VPS** (local API uses VPS MySQL, or backoffice calls an API that reads from VPS).
2. Backoffice user clicks **Open Studio** and confirms the order is good (script, clip, options).
3. Backoffice user clicks **Generate reel** — this calls the **local** video generation process/API (local API creates a reel job; local worker picks it up).
4. Video is **generated locally** (reels-generator worker runs `reels_generator.py` on your machine).
5. The **output is transferred/uploaded to the VPS API** (worker POSTs video/srt/txt/audio to VPS).
6. The **customer receives the output on their receipt page** (web-orders on VPS serves the receipt and the reel files from the VPS).

## Flow (technical)

1. **Remote:** Customers use **web-orders** (pointing at **VPS API URL**). Orders and receipts are served from the VPS.
2. **Local backoffice:** You run the **web backoffice** with **`VITE_API_BASE_URL`** = **local API URL** (e.g. `http://localhost:3010`). Your **local API** must be configured with **VPS MySQL** (`TYPEORM_DATABASE_HOST` = VPS host) so it sees the same orders. Run: `cd web && npm run dev`.
3. **Process (reels):** In the backoffice you click “Process” → the **local API** creates a reel job in the DB (same VPS MySQL) and returns. The **reels-generator worker** (local) polls the **VPS API** for queued jobs, runs `reels_generator.py` locally, then uploads video/srt/txt/audio to the **VPS API**. The VPS stores the output; the order is marked ready. The **customer** sees the reel on their receipt (web-orders loads from VPS).
   - **Local worker:** Set **VPS_API_URL** to your VPS API URL. Run the worker: `docker compose -f docker-compose.local.yml --profile workers up -d` (with repo mounted), or `cd workers/reels-generator && VPS_API_URL=https://api.yourdomain.com node worker.js`.
   - **Optional:** Set **WORKER_SECRET** on both VPS (in API env) and worker so only your worker can call the worker endpoints.

## Env files for deploy

### VPS API (deploy / production)

- Use **`.env.prod`** (root) with `docker-compose.deploy.yml` so build args and MySQL vars are set.
- Use **`api/.env.prod`** for the API container (DB, CORS, PayMongo, etc.):
  - **REELS_RUN_IN_PROCESS=false** — Do not run reel generation on the VPS; jobs are queued in the DB for the local worker.
  - **RUN_TRANSCRIPTION_IN_API=false** — Transcription is handled by the transcription worker.
  - **CORS_ORIGINS** — Include your web-orders origin (e.g. `https://orders.yourdomain.com`).
  - **WORKER_SECRET** (optional) — If set, worker endpoints require `X-Worker-Secret` header (set the same value on the local worker).
- **Ports (deploy/prod):** API **3010**, web-orders **8443**, MySQL **3307** (host). Set `VITE_API_BASE_URL` and `VITE_API_BASE_URL_WEB_ORDERS` to match how you expose these (e.g. `http(s)://your-vps:3010`, `http(s)://your-vps:8443` or your domain).

### Local (backoffice + reels worker)

- **Web backoffice:** In `web/.env.local` (and .env.dev, .env.prod): **VITE_API_BASE_URL** = **Local API** (leave empty for default `http://localhost:3010`). **VITE_API_VPS_BASE_URL** = **VPS API** URL (e.g. `https://api.yourdomain.com`). The backoffice uses the Local API for orders and “Generate reel”; use the VPS URL when you need to reference the VPS (e.g. receipt links).
- **Web-orders (customer site):** Built with **VPS API URL** (e.g. `VITE_API_BASE_URL_WEB_ORDERS` in root `.env.prod` for deploy) so customers hit the VPS. Reels and receipts are served from VPS; after the worker uploads output, the customer sees the reel on the receipt.
- **Reels generator worker:** **VPS_API_URL** (or API_BASE_URL) = **VPS API URL**. Worker polls the VPS for queued jobs and uploads finished output to the VPS. **REPO_ROOT** = path to repo on your machine. Optional **WORKER_SECRET** = same as on VPS.

## GitHub Actions deploy (VPS)

On **push to `main`**, the workflow in **`.github/workflows/deploy.yml`** deploys to the VPS:

1. Checkout repo on the runner.
2. Install **SSH key** (`webfactory/ssh-agent`) using `VPS_SSH_KEY`.
3. **SSH to VPS** (`root@88.222.245.88`), then:
   - Clone repo to **`/microworkers`** if not present, else `git pull origin main`.
   - Export all required env vars from **GitHub Secrets** (see below).
   - Run: `docker compose -f docker-compose.deploy.yml down || true` then `docker compose -f docker-compose.deploy.yml up -d --build`.

**VPS path:** `/microworkers` (repo root). Ports on the host: MySQL **3307**, API **3010**, web-orders **8443**.

**Transcription and deploy timeout (Ubuntu 22.04 + Docker):** The transcription image includes **faster_whisper** (Debian base) so clips are transcribed automatically. The first build can take several minutes. The deploy job has **timeout-minutes: 45** and SSH **ServerAliveInterval=60** so the connection stays up during the build; if you still hit timeouts, build the transcription image once on the VPS manually (`docker compose -f docker-compose.deploy.yml build transcription`) then deploy as usual.

**Private repo:** The clone runs **on the VPS**. For a private repo, add the **VPS public key** as a GitHub **Deploy key** (read-only) for this repo, and change the clone URL in the workflow to SSH: `git@github.com:OWNER/microworkers.git` (and ensure the VPS has that key in `~/.ssh`). Alternatively use a **Personal Access Token** in the URL (not recommended in the workflow; use deploy key).

### Required GitHub Secrets

Configure these in the repo: **Settings → Secrets and variables → Actions**.

| Secret | Used for | Example / note |
|--------|----------|-----------------|
| **VPS_SSH_KEY** | SSH to VPS (private key) | Full private key content |
| **MYSQL_ROOT_PASSWORD** | MySQL root | Strong password |
| **MYSQL_DATABASE** | MySQL DB name | `microworkers` |
| **MYSQL_USER** | MySQL app user | `microworkers` |
| **MYSQL_PASSWORD** | MySQL app password | Strong password |
| **TYPEORM_DATABASE_PORT** | API → MySQL (container port) | `3306` (internal; host is 3307) |
| **TYPEORM_DATABASE_USERNAME** | API DB user | Same as MYSQL_USER |
| **TYPEORM_DATABASE_PASSWORD** | API DB password | Same as MYSQL_PASSWORD |
| **TYPEORM_DATABASE_NAME** | API DB name | Same as MYSQL_DATABASE |
| **CORS_ORIGINS** | API CORS | e.g. `https://orders.yourdomain.com,http://localhost:5176` |
| **VITE_API_BASE_URL_WEB_ORDERS** | web-orders build: API URL | e.g. `https://88.222.245.88:3010` or your domain |
| **VITE_PAYMONGO_ENABLED** | web-orders build | `true` or `false` |
| **VITE_APP_ENV** | web-orders build | `production` |
| **REELS_MAX_CONCURRENT_JOBS** | API (optional) | e.g. `5` |
| **PAYMONGO_SECRET_KEY** | API PayMongo | From PayMongo dashboard |
| **WORKER_SECRET** | API + reels worker (optional) | Shared secret for worker endpoints |

The workflow **exports** these on the VPS before running `docker compose -f docker-compose.deploy.yml up -d --build`; the compose file uses `${VAR}` so no `.env.prod` file is required on the server.

## Summary

- **Deploy:** `docker-compose.deploy.yml` → **api** + **web-orders** + **transcription** + MySQL. No web backoffice, no reels-generator.
- **Web-orders** uses **VPS API URL**; customers place orders and see receipts/reels from the VPS.
- **Backoffice** (generate orders) uses **local API URL**; local API must use **VPS MySQL** so it sees orders and creates jobs in the same DB.
- **Reel generation:** VPS API has **REELS_RUN_IN_PROCESS=false**. Local worker uses **VPS_API_URL** to poll for jobs and upload output; when done, output is on the VPS and **visible to the customer** on their receipt.
- **Transcription:** Runs on VPS; API sets `RUN_TRANSCRIPTION_IN_API=false` so the transcription worker handles pending clips. The transcription image includes `faster_whisper`; deploy uses a 45-minute job timeout and SSH keepalive so the build can complete.
