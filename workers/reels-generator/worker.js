/**
 * Reels generator worker (local only): intended to poll the API for pending reel jobs,
 * run reels_generator.py, and report results back.
 *
 * Full implementation requires the API to:
 * - Persist reel jobs to a DB table (e.g. reel_jobs) when REELS_RUN_IN_PROCESS=false
 * - Expose GET /api/worker/reel-jobs?status=queued and PATCH /api/worker/reel-jobs/:id
 *
 * Until then, run the API with REELS_RUN_IN_PROCESS=true (default) so generation runs
 * inside the API process. This worker container is a placeholder for the future
 * local-only video generation service.
 */
import 'dotenv/config'

const API_BASE = process.env.API_BASE_URL || 'http://api:3000'
const POLL_MS = 15000

console.log('Reels generator worker (local service placeholder)')
console.log('API base:', API_BASE)
console.log('To run video generation today, use the API with REELS_RUN_IN_PROCESS=true (default).')
console.log('This worker will poll for jobs once the API exposes a job queue (planned).')
console.log('Polling every', POLL_MS / 1000, 's...')

async function main() {
  while (true) {
    try {
      const res = await fetch(`${API_BASE}/api/worker/reel-jobs?status=queued`, {
        headers: { Accept: 'application/json' },
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          console.log('Jobs found:', data.length, '(run reels_generator.py per job - not yet implemented)')
        }
      }
    } catch (err) {
      console.warn('Poll error:', err.message)
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
