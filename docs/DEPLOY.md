# Deploy: API + web-orders + transcription (CI/CD)

This doc describes deploying the **light** stack (API, web-orders, transcription) and running the **web backoffice** and **video generator** locally.

## What gets deployed vs local

| Deployed (remote) | Local only |
|-------------------|------------|
| **API** (no transcription spawn, no video generation when worker used) | **Web backoffice** |
| **web-orders**    | **Reels generator** (separate service; job queue in API planned) |
| **MySQL**         | |
| **Transcription** (separate Docker service) | |

- **CI/CD:** Use **`docker-compose.deploy.yml`** in your pipeline. It defines `mysql`, `api`, `web-orders`, and **`transcription`** (no `web` backoffice, no `reels-generator`).
- The API runs with **`RUN_TRANSCRIPTION_IN_API=false`** so it does not run `transcribe_clip.py` in-process; the **transcription** service picks up pending clips from the DB and runs transcription.
- **Pipeline example:** On push, build and deploy:
  ```bash
  docker compose -f docker-compose.deploy.yml --env-file .env.prod up -d --build
  ```
  (Adjust for your provider: e.g. build images, push to registry, then on the server pull and run with the same compose file.)

## Flow

1. **Remote:** Customers use **web-orders** to place orders. The **API** stores orders in **MySQL** and serves order/checkout data.
2. **Local:** You run the **web backoffice** on your machine and point it at the deployed API:
   - In `web/.env` or `web/.env.local` set **`VITE_API_BASE_URL`** to your deployed API URL (e.g. `https://api.yourdomain.com`).
   - Run: `cd web && npm run dev`. The backoffice pulls order details from the online API.
3. **Processing:** You process orders (run the Python reels generator) on your machine (strong CPU). Today the generator is run **by the API** (same process). So to “process locally and send back online” you have two patterns:
   - **A. Local API + same DB:** Run the API locally (e.g. `docker-compose.local.yml` or `npm run start:dev` in `api/`) with **`TYPEORM_DATABASE_HOST`** pointing at the **deployed MySQL** (or a replica). The local API runs the generator; output is written locally. You then need a way to “send it back” (e.g. upload endpoint, rsync, or shared storage).
   - **Reels generator:** Use the separate **reels-generator** service locally (`--profile workers`); full job-queue support in the API is planned.

## Env files for deploy

- Use **`.env.prod`** (root) with `docker-compose.deploy.yml` so build args and MySQL vars are set.
- Use **`api/.env.prod`** for the API container (DB, CORS, PayMongo, etc.).
- Ensure **`CORS_ORIGINS`** in `api/.env.prod` includes your web-orders origin (e.g. `https://orders.yourdomain.com`).

## Summary

- **Deploy:** `docker-compose.deploy.yml` → **api** + **web-orders** + **transcription** + MySQL. No web backoffice, no reels-generator.
- **Transcription:** Runs as its own service (online). API sets `RUN_TRANSCRIPTION_IN_API=false` so the transcription worker handles pending clips.
- **Backoffice:** Run locally; set **VITE_API_BASE_URL** to the deployed API URL so it pulls orders from online.
- **Reels generator:** Separate service for local use (`docker-compose.local.yml --profile workers`). Full implementation (API job queue + worker running `reels_generator.py`) is planned; until then, generation runs in the API process.
