# Workers (separate Docker services)

## Transcription (`workers/transcription`)

- **Runs:** Online (deployed with API + web-orders).
- **Role:** Polls MySQL for order clips with `transcript_status='pending'`, runs `transcribe_clip.py`, updates `clips` and `orders`.
- **API:** Set **`RUN_TRANSCRIPTION_IN_API=false`** in the API so it does not run transcription in-process (deploy compose sets this).
- **Compose:** Included in `docker-compose.deploy.yml` and `docker-compose.local.yml`.

## Reels generator (`workers/reels-generator`)

- **Runs:** Local only (heavy CPU).
- **Role:** Intended to poll the API for pending reel jobs, run `reels_generator.py`, and report results. **Currently a placeholder:** the API does not yet expose a job queue; when it does, this worker will run generation locally.
- **Until then:** Run the API with default `REELS_RUN_IN_PROCESS=true` so generation runs inside the API.
- **Compose:** In `docker-compose.local.yml` under the **`workers`** profile: `docker compose -f docker-compose.local.yml --profile workers up -d`.
