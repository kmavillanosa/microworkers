/**
 * Reels generator worker (local only). Polls the VPS API for queued reel jobs,
 * runs reels_generator.py locally, and uploads output back to the VPS.
 *
 * VPS API: set REELS_RUN_IN_PROCESS=false so jobs are queued in DB only.
 * Local: set VPS_API_URL to your VPS API (e.g. https://api.yourdomain.com or http://vps-ip:3010).
 * Optional: WORKER_SECRET on both sides for auth.
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { runGenerator, outputDir } from './run-generator.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const API_BASE = process.env.VPS_API_URL || process.env.API_BASE_URL || 'http://localhost:3010'
const WORKER_SECRET = process.env.WORKER_SECRET
const POLL_MS = parseInt(process.env.POLL_MS || '15000', 10)
const REPO_ROOT = process.env.REPO_ROOT || path.resolve(process.cwd(), '..')

const orderClipsDir = path.join(REPO_ROOT, 'assets', 'order-clips')
const clipsDir = path.join(REPO_ROOT, 'assets', 'game-clips')

function headers() {
  const h = { Accept: 'application/json', 'Content-Type': 'application/json' }
  if (WORKER_SECRET) h['X-Worker-Secret'] = WORKER_SECRET
  return h
}

async function downloadClip(apiBase, clipName, type = 'order-clips') {
  const base = apiBase.replace(/\/$/, '')
  const url = type === 'order-clips'
    ? `${base}/media/order-clips/${encodeURIComponent(clipName)}`
    : `${base}/media/clips/${encodeURIComponent(clipName)}`
  const res = await fetch(url)
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  const dir = type === 'order-clips' ? orderClipsDir : clipsDir
  await fs.promises.mkdir(dir, { recursive: true })
  const outPath = path.join(dir, clipName)
  await fs.promises.writeFile(outPath, buf)
  return outPath
}

async function processOneJob(job) {
  if (job.clipName) {
    const orderPath = path.join(orderClipsDir, job.clipName)
    const catalogPath = path.join(clipsDir, job.clipName)
    const orderExists = await fs.promises.access(orderPath).then(() => true).catch(() => false)
    const catalogExists = await fs.promises.access(catalogPath).then(() => true).catch(() => false)
    if (!orderExists && !catalogExists) {
      await downloadClip(API_BASE, job.clipName, 'order-clips') ||
        await downloadClip(API_BASE, job.clipName, 'clips')
    }
  }

  const { outputFolderName, folderPath } = await runGenerator(job, API_BASE)

  const videoPath = path.join(folderPath, 'reel.mp4')
  const srtPath = path.join(folderPath, 'reel.srt')
  const txtPath = path.join(folderPath, 'reel.txt')
  const audioPath = path.join(folderPath, 'reel-audio.wav')

  const form = new FormData()
  form.append('outputFolder', outputFolderName)
  form.append('video', new Blob([await fs.promises.readFile(videoPath)]), 'reel.mp4')
  form.append('srt', new Blob([await fs.promises.readFile(srtPath)]), 'reel.srt')
  form.append('txt', new Blob([await fs.promises.readFile(txtPath)]), 'reel.txt')
  try {
    const audioBuf = await fs.promises.readFile(audioPath)
    if (audioBuf.length) form.append('audio', new Blob([audioBuf]), 'reel-audio.wav')
  } catch {
    // optional
  }

  const uploadHeaders = {}
  if (WORKER_SECRET) uploadHeaders['X-Worker-Secret'] = WORKER_SECRET

  const uploadRes = await fetch(`${API_BASE}/api/worker/reel-jobs/${job.id}/upload`, {
    method: 'POST',
    headers: uploadHeaders,
    body: form,
  })
  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    throw new Error(`Upload failed: ${uploadRes.status} ${err}`)
  }
  return await uploadRes.json()
}

async function main() {
  console.log('Reels generator worker (local)')
  console.log('VPS API:', API_BASE)
  console.log('REPO_ROOT:', REPO_ROOT)
  console.log('Polling every', POLL_MS / 1000, 's')

  while (true) {
    try {
      const res = await fetch(`${API_BASE}/api/worker/reel-jobs?status=queued`, { headers: headers() })
      if (!res.ok) {
        console.warn('Poll failed:', res.status, await res.text())
        await new Promise((r) => setTimeout(r, POLL_MS))
        continue
      }
      const jobs = await res.json()
      if (!Array.isArray(jobs) || jobs.length === 0) {
        await new Promise((r) => setTimeout(r, POLL_MS))
        continue
      }

      const job = jobs[0]
      let claimRes = await fetch(`${API_BASE}/api/worker/reel-jobs/${job.id}/claim`, {
        method: 'POST',
        headers: headers(),
      })
      if (!claimRes.ok) {
        console.warn('Claim failed:', claimRes.status)
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      const claimed = await claimRes.json()
      console.log('Processing job', job.id, '…')

      try {
        const result = await processOneJob(claimed)
        console.log('Job', job.id, 'completed:', result?.reel?.id)
      } catch (err) {
        console.error('Job', job.id, 'failed:', err.message)
        await fetch(`${API_BASE}/api/worker/reel-jobs/${job.id}`, {
          method: 'PATCH',
          headers: headers(),
          body: JSON.stringify({
            status: 'failed',
            error: err.message || 'Worker error',
          }),
        }).catch(() => {})
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
