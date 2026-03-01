# Containerizing Microworkers

All services run with Docker Compose: **MySQL**, **API**, **web** (main app), **web-orders** (order flow). Use the environment-specific compose file and env file:

- **Local:** `docker-compose.local.yml` + `--env-file .env.local` (API uses `api/.env.local`)
- **Dev:** `docker-compose.dev.yml` + `--env-file .env.dev` (API uses `api/.env.dev`)
- **Production (full):** `docker-compose.prod.yml` + `--env-file .env.prod` (API uses `api/.env.prod`)
- **Deploy (CI/CD, light stack only):** `docker-compose.deploy.yml` + `--env-file .env.prod` — **API + web-orders only** (no web backoffice). Use this in your pipeline. See [Deploy: API + web-orders only](#deploy-cicd-api--web-orders-only).

## Quick start (local)

1. **Secrets**
   - In repo root: fill `.env.local` (MYSQL_*, TYPEORM_*, CORS_ORIGINS, REELS_*, VITE_*, SAMBA_* if using share).
   - In `api/`: fill `api/.env.local` (TYPEORM_DATABASE_PASSWORD, PAYMONGO_SECRET_KEY, YouTube/FB keys if needed).

2. **Run**
   ```bash
   docker compose -f docker-compose.local.yml --env-file .env.local up -d
   ```
   - API: http://localhost:3000  
   - Web: http://localhost:5173  
   - Web-orders: http://localhost:5174  
   - phpMyAdmin: http://localhost:8080  

3. **Assets and output**
   - The API container mounts the **repo root** at `/app/data` (`REPO_ROOT=/app/data`). So the API sees your local `assets/` (fonts, game-clips, credentials, voices) and `output/` on the host. No need to copy assets into the image; add or update files in `assets/` and `output/` on the host and the container uses them.
   - Ensure `assets/db`, `assets/credentials`, `assets/order-clips`, `assets/cache/images`, and `output` exist and are writable (the API and reels write here). On Linux, if the container user cannot write, create the dirs and e.g. `chown -R 1000:1000 assets/db output` (node in the image typically uses uid 1000).

4. **First-time MySQL**
   - The `api/mysql-initdb.d/grant_privileges.sql` script runs on first MySQL start: it creates the `reelmaker` database and grants the app user access. No manual GRANT needed when using the Compose MySQL service.

## Services

| Service     | Image build        | Port  | Notes |
|------------|--------------------|-------|--------|
| mysql      | `mysql:8.0`        | 3306  | Init runs `api/mysql-initdb.d/*.sql` on first start. |
| phpmyadmin | `phpmyadmin/phpmyadmin` | 8080  | Web UI for MySQL. Open http://localhost:8080 — log in as `root` or `user` (passwords from .env). |
| api        | `./api/Dockerfile` | 3000  | NestJS; uses `api/.env.local` (or .env.dev / .env.prod) and DB. |
| web        | `./web/Dockerfile` | 5173→80 | Vite build + nginx; `VITE_API_BASE_URL` set to `http://localhost:3000` at build. |
| web-orders | `./web-orders/Dockerfile` | 5174→80 | Same as web. |

## Build args (frontends)

- **VITE_API_BASE_URL**  
  Set in `docker-compose.yml` build args for `web` and `web-orders`. Default `http://localhost:3000` so the browser (on the host) can call the API. If you put a reverse proxy in front, change this to the public API URL and rebuild the frontend images.

## Transcription and reels-generator services

- **Transcription** (`workers/transcription`): Separate Docker service that polls MySQL for clips with `transcript_status='pending'`, runs `transcribe_clip.py`, and updates the DB. Used in **deploy** and **local** compose. Set **`RUN_TRANSCRIPTION_IN_API=false`** in the API (deploy compose does this) so the API does not run transcription in-process.
- **Reels-generator** (`workers/reels-generator`): Separate Docker service intended to run **locally only** (heavy CPU). In `docker-compose.local.yml` under the **`workers`** profile. Currently a placeholder until the API exposes a job queue; until then, video generation runs in the API. See **`workers/README.md`**.

## Deploy (CI/CD): API + web-orders + transcription

To deploy only the **light** stack (API + web-orders, no web backoffice), use **`docker-compose.deploy.yml`**. This is intended for your CI/CD pipeline and for a remote server with limited CPU.

- **Build and run (e.g. in pipeline):**
  ```bash
  docker compose -f docker-compose.deploy.yml --env-file .env.prod up -d --build
  ```
- **Services:** `mysql`, `api`, `web-orders` only. No `web` (backoffice).

**Intended flow:**
- **Remote (deployed):** API + web-orders + MySQL. Customers place orders via web-orders; API stores orders and serves data.
- **Your machine (local):** Run the **web backoffice** only (e.g. `cd web && npm run dev`). Point it at the deployed API by setting **`VITE_API_BASE_URL`** in `web/.env` (or `web/.env.local`) to your deployed API URL (e.g. `https://api.yourdomain.com`). The backoffice then pulls order details from the deployed API.
- **Video generation:** Today the Python reels generator runs **inside the API process** (same container). So either:
  - **Option A:** Run the API locally as well (e.g. `docker-compose.local.yml` or `cd api && npm run start:dev`), with that local API using the **same MySQL** as the deployed API (e.g. `TYPEORM_DATABASE_HOST` = your deployed DB host). Then the local API runs the generator; output is on your disk. To “send it back online” you would need a way to sync or upload that output to the server (e.g. an upload endpoint, or shared storage).
  - **Option B:** Run generation on the deployed server (current behavior). If the server is light on CPU, set **`REELS_MAX_CONCURRENT_JOBS=1`** (or `0` to effectively disable) in `api/.env.prod` to limit load until you add a separate local worker or upload flow.

See **`docs/DEPLOY.md`** for a short deployment and architecture summary.

## CORS

The API reads **CORS_ORIGINS** from the environment (comma-separated). Compose sets it to `http://localhost:5173,http://localhost:5174,http://localhost:3000`. For production, set it to your real frontend origins.

## Using an external MySQL host

To use an existing MySQL (e.g. `88.222.245.88`) instead of the Compose MySQL:

1. Do not start the `mysql` service:  
   `docker compose -f docker-compose.local.yml --env-file .env.local up -d api web web-orders`
2. In `api/.env.local` (or the env file for your target) set `TYPEORM_DATABASE_HOST` to that host and ensure the grant script has been run there (or the DB and user already exist).
3. Remove or comment out `depends_on: mysql` for `api` in the compose file you use when not using the Compose MySQL.

## Caching Docker images (save resources on rebuilds)

Builds reuse layers and npm downloads so repeated `docker compose build` / `docker compose up -d --build` use fewer resources.

- **Dockerfile cache mounts**  
  All app Dockerfiles use BuildKit `RUN --mount=type=cache,target=/root/.npm` for `npm ci`. The npm cache is shared across builds so dependencies are not re-downloaded when only app code changes. Requires BuildKit (default in Docker Desktop and Docker Engine 23+).

- **Layer order**  
  `package.json` / `package-lock.json` are copied before source code, so dependency layers stay cached when you change only source.

- **Force BuildKit (if needed)**  
  If you see "no build stage" or cache mounts not used, enable BuildKit:
  ```bash
  export DOCKER_BUILDKIT=1
  docker compose -f docker-compose.local.yml --env-file .env.local build
  ```
  Or set `DOCKER_BUILDKIT=1` in your shell profile.

- **Reusing images elsewhere**  
  To pull/push built images (e.g. to a registry) and reuse them as cache:
  ```bash
  docker compose -f docker-compose.local.yml --env-file .env.local build
  docker tag microworkers-api myreg/microworkers-api:latest
  docker push myreg/microworkers-api:latest
  ```
  On another machine, pull first then build with `cache_from` if you add it to your compose file (e.g. `docker-compose.local.yml`).

## Network share (SMB) for assets and output

To expose the repo (assets, output, etc.) as a Windows/Linux network drive (e.g. `\\host\microworkers`):

1. Start the stack including the optional `samba` service:
   ```bash
   docker compose -f docker-compose.local.yml --env-file .env.local --profile share up -d
   ```
2. Set share user/password (optional; defaults: user `share`, password `share`):
   - In root `.env.local`: `SAMBA_USER=youruser`, `SAMBA_PASSWORD=yourpass`, `SAMBA_WORKGROUP=WORKGROUP`.
3. From another machine, map a drive:
   - **Windows:** File Explorer → Map network drive → `\\<host-ip>\microworkers`, use the credentials above.
   - **macOS:** Finder → Go → Connect to Server → `smb://<host-ip>/microworkers`.

The share is the whole repo (assets, output, api, web, etc.). To restrict to only `assets` and `output`, you can change the samba service to mount a subfolder or use a second share; see `dperson/samba` docs.

## Development without containers

- **API:** `cd api && npm run start:dev` (uses `api/.env` or `api/.env.local`, DB host as in that file).
- **Web:** `cd web && npm run dev` (default port 5173).
- **Web-orders:** `cd web-orders && npm run dev` (port 5174).
- Set `VITE_API_BASE_URL` in the frontend apps if the API is not on the default URL.
