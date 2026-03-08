/**
 * Reels generator worker (local only). Polls the VPS API for queued reel jobs,
 * runs reels_generator.py locally, and uploads output back to the VPS.
 *
 * VPS API: set REELS_RUN_IN_PROCESS=false so jobs are queued in DB only.
 * Set VPS_API_URL to a URL the worker can reach:
 *   - Same host via nginx: https://reelagad.com (recommended; no port, uses your domain).
 *   - Direct API (if reachable): https://vps-ip:3010 (worker accepts self-signed certs).
 *   - Same Docker network as API: http://api:3000
 * When using HTTPS with a self-signed cert, the worker accepts it automatically.
 * Optional: WORKER_SECRET on both sides for auth.
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Agent, fetch as undiciFetch } from 'undici'
import { runGenerator, outputDir } from './run-generator.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const API_BASE = (
  process.env.VPS_API_URL ||
  process.env.API_BASE_URL ||
  'https://reelagad.com'
).replace(/\/+$/, '')
const WORKER_SECRET = process.env.WORKER_SECRET
const POLL_MS = parseInt(process.env.POLL_MS || '3000', 10)
const POLL_MAX_DELAY_MS = parseInt(process.env.POLL_MAX_DELAY_MS || '30000', 10)
const POLL_ERROR_LOG_EVERY = Math.max(1, parseInt(process.env.POLL_ERROR_LOG_EVERY || '10', 10))
const POLL_TRANSIENT_RETRY_DELAY_MS = Math.max(0, parseInt(process.env.POLL_TRANSIENT_RETRY_DELAY_MS || '800', 10))
const REPO_ROOT = process.env.REPO_ROOT || path.resolve(process.cwd(), '..')
const VERBOSE = /^(1|true|yes)$/i.test(process.env.WORKER_VERBOSE || '')
const WORKER_LOCK_PATH = process.env.WORKER_LOCK_PATH || path.join(REPO_ROOT, '.reels-generator-worker.lock')

let workerLockHandle = null
let workerLockOwned = false

/** Fetch that accepts self-signed HTTPS certs when talking to the VPS API. */
const isHttps = /^https:\/\//i.test(API_BASE)
const dispatcher = isHttps
  ? new Agent({ connect: { rejectUnauthorized: false } })
  : undefined
function apiFetch(url, opts = {}) {
  return dispatcher ? undiciFetch(url, { ...opts, dispatcher }) : fetch(url, opts)
}

const orderClipsDir = path.join(REPO_ROOT, 'assets', 'order-clips')
const clipsDir = path.join(REPO_ROOT, 'assets', 'game-clips')

function headers() {
  const h = { Accept: 'application/json', 'Content-Type': 'application/json' }
  if (WORKER_SECRET) h['X-Worker-Secret'] = WORKER_SECRET
  return h
}

function logVerbose(...args) {
  if (VERBOSE) console.log('[worker]', ...args)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientGatewayStatus(status) {
  return status === 502 || status === 503 || status === 504
}

function formatErr(err) {
  const parts = [err?.message || String(err)]
  if (err?.cause) parts.push('cause:', err.cause?.message ?? err.cause)
  if (err?.code) parts.push('code:', err.code)
  return parts.join(' ')
}

function parseLockPid(raw) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    const pid = Number(parsed?.pid)
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    const match = raw.match(/\b(\d{1,10})\b/)
    if (!match?.[1]) return null
    const pid = Number(match[1])
    return Number.isInteger(pid) && pid > 0 ? pid : null
  }
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function writeWorkerLock(handle) {
  const payload = `${JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString(),
    apiBase: API_BASE,
  })}\n`
  await handle.writeFile(payload, 'utf8')
}

async function acquireWorkerLock() {
  try {
    workerLockHandle = await fs.promises.open(WORKER_LOCK_PATH, 'wx')
    await writeWorkerLock(workerLockHandle)
    workerLockOwned = true
    return
  } catch (err) {
    if (err?.code !== 'EEXIST') throw err
  }

  const raw = await fs.promises.readFile(WORKER_LOCK_PATH, 'utf8').catch(() => '')
  const existingPid = parseLockPid(raw)
  if (existingPid && existingPid !== process.pid && isPidAlive(existingPid)) {
    throw new Error(`Another reels worker is already running (pid=${existingPid}). Lock file: ${WORKER_LOCK_PATH}`)
  }
  if (raw && !existingPid) {
    throw new Error(`Worker lock exists but PID is unreadable: ${WORKER_LOCK_PATH}. Remove this file only if no worker is running.`)
  }

  await fs.promises.unlink(WORKER_LOCK_PATH).catch(() => {})
  workerLockHandle = await fs.promises.open(WORKER_LOCK_PATH, 'wx')
  await writeWorkerLock(workerLockHandle)
  workerLockOwned = true
}

async function releaseWorkerLock() {
  if (!workerLockOwned) return
  workerLockOwned = false
  const handle = workerLockHandle
  workerLockHandle = null
  if (handle) await handle.close().catch(() => {})
  await fs.promises.unlink(WORKER_LOCK_PATH).catch(() => {})
}

function registerLockCleanupHandlers() {
  const gracefulExit = (signal) => {
    releaseWorkerLock()
      .catch(() => {})
      .finally(() => process.exit(signal ? 0 : 1))
  }
  process.on('SIGINT', () => gracefulExit('SIGINT'))
  process.on('SIGTERM', () => gracefulExit('SIGTERM'))
  process.on('exit', () => {
    if (!workerLockOwned) return
    try {
      if (workerLockHandle) workerLockHandle.close().catch(() => {})
      fs.unlinkSync(WORKER_LOCK_PATH)
    } catch {
      // ignore lock cleanup failures on process exit
    }
  })
}

async function downloadClip(apiBase, clipName, type = 'order-clips') {
  const base = apiBase.replace(/\/$/, '')
  const url = type === 'order-clips'
    ? `${base}/media/order-clips/${encodeURIComponent(clipName)}`
    : `${base}/media/clips/${encodeURIComponent(clipName)}`
  const res = await apiFetch(url)
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

  const onProgress = async (progress, stage) => {
    process.stdout.write(`\r  [Reel] ${progress}% · ${stage}    `)
    await apiFetch(`${API_BASE}/api/worker/reel-jobs/${job.id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ progress, stage }),
    })
  }
  const { outputFolderName, folderPath } = await runGenerator(job, API_BASE, { onProgress })
  process.stdout.write('\n')

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

  const uploadRes = await apiFetch(`${API_BASE}/api/worker/reel-jobs/${job.id}/upload`, {
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
  await acquireWorkerLock()
  registerLockCleanupHandlers()

  console.log('Reels generator worker (local)')
  console.log('VPS API:', API_BASE)
  console.log('REPO_ROOT:', REPO_ROOT)
  console.log('Lock file:', WORKER_LOCK_PATH)
  console.log('Polling every', POLL_MS / 1000, 's')
  if (VERBOSE) console.log('Verbose logging: on')

  const pollUrl = `${API_BASE}/api/worker/reel-jobs?status=queued`
  let pollErrorCount = 0
  let pollErrorSuppressed = 0
  let pollDelayMs = POLL_MS
  let lastPollErrorSignature = ''

  const flushSuppressedPollErrors = () => {
    if (pollErrorSuppressed <= 0) {
      return
    }

    console.warn(`Poll error repeated ${pollErrorSuppressed} additional times.`)
    pollErrorSuppressed = 0
  }

  const resetPollHealth = () => {
    if (pollErrorCount > 0) {
      flushSuppressedPollErrors()
      console.log(`Polling recovered after ${pollErrorCount} error${pollErrorCount === 1 ? '' : 's'}.`)
    }

    pollErrorCount = 0
    pollDelayMs = POLL_MS
    lastPollErrorSignature = ''
  }

  const growPollBackoff = () => {
    pollDelayMs = Math.min(POLL_MAX_DELAY_MS, Math.max(POLL_MS, Math.round(pollDelayMs * 1.5)))
  }

  const shouldLogPollError = (signature) => {
    if (pollErrorCount <= 1) {
      return true
    }

    if (signature !== lastPollErrorSignature) {
      return true
    }

    return pollErrorCount % POLL_ERROR_LOG_EVERY === 0
  }

  while (true) {
    try {
      logVerbose('GET', pollUrl)
      let res = await apiFetch(pollUrl, { headers: headers() })

      if (!res.ok && isTransientGatewayStatus(res.status)) {
        logVerbose(`Transient gateway status ${res.status}; retrying poll in ${POLL_TRANSIENT_RETRY_DELAY_MS}ms`)
        if (POLL_TRANSIENT_RETRY_DELAY_MS > 0) {
          await sleep(POLL_TRANSIENT_RETRY_DELAY_MS)
        }

        const retryRes = await apiFetch(pollUrl, { headers: headers() })
        if (retryRes.ok) {
          logVerbose('Transient gateway error recovered on immediate retry')
          res = retryRes
        } else {
          res = retryRes
        }
      }

      if (!res.ok) {
        const body = await res.text()
        const signature = `http-${res.status}`
        pollErrorCount += 1
        if (shouldLogPollError(signature)) {
          flushSuppressedPollErrors()
          console.warn('Poll failed:', res.status, res.statusText, body ? body.slice(0, 200) : '')
          if (res.status === 401 && !WORKER_SECRET) {
            console.warn('  → API may require WORKER_SECRET. Set the same value in the worker env.')
          }
        } else {
          pollErrorSuppressed += 1
        }

        lastPollErrorSignature = signature
        growPollBackoff()
        await sleep(pollDelayMs)
        continue
      }

      resetPollHealth()
      const jobs = await res.json()
      logVerbose('Poll ok, jobs:', Array.isArray(jobs) ? jobs.length : 0)
      if (!Array.isArray(jobs) || jobs.length === 0) {
        await sleep(POLL_MS)
        continue
      }

      const job = jobs[0]
      logVerbose('Claiming job', job.id)
      let claimRes = await apiFetch(`${API_BASE}/api/worker/reel-jobs/${job.id}/claim`, {
        method: 'POST',
        headers: headers(),
      })
      if (!claimRes.ok) {
        const body = await claimRes.text()
        console.warn('Claim failed:', claimRes.status, body ? body.slice(0, 200) : '')
        if (claimRes.status === 401 && !WORKER_SECRET) {
          console.warn('  → Set WORKER_SECRET in the worker env to match the API.')
        }
        await sleep(2000)
        continue
      }
      const claimed = await claimRes.json()
      console.log('Processing job', job.id, '…')

      try {
        const result = await processOneJob(claimed)
        console.log('Job', job.id, 'completed:', result?.reel?.id)
      } catch (err) {
        console.error('Job', job.id, 'failed:', err.message)
        if (VERBOSE && err?.stack) console.error(err.stack)
        await apiFetch(`${API_BASE}/api/worker/reel-jobs/${job.id}`, {
          method: 'PATCH',
          headers: headers(),
          body: JSON.stringify({
            status: 'failed',
            error: err.message || 'Worker error',
          }),
        }).catch(() => {})
      }
    } catch (err) {
      pollErrorCount += 1
      const detail = formatErr(err)
      const signature = `${err?.code || 'ERR'}:${err?.message || String(err)}`

      if (shouldLogPollError(signature)) {
        flushSuppressedPollErrors()
        console.warn('Poll error:', err?.message || err)
        console.warn('  (detail:', detail + ')')
        if (pollErrorCount === 1) {
          console.warn(
            '  → Ensure VPS_API_URL is reachable from this container (e.g. https://reelagad.com). Current:',
            API_BASE,
          )
        }
      } else {
        pollErrorSuppressed += 1
      }

      lastPollErrorSignature = signature
      growPollBackoff()
      if (VERBOSE && err?.stack) console.warn(err.stack)
    }
    await sleep(pollDelayMs)
  }
}

main().catch((err) => {
  console.error(err)
  releaseWorkerLock()
    .catch(() => {})
    .finally(() => process.exit(1))
})
