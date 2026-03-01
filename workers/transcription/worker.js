/**
 * Transcription worker: polls MySQL for order clips with transcript_status='pending',
 * runs transcribe_clip.py, updates clips and orders tables.
 * Run as a separate Docker service (online). API should set RUN_TRANSCRIPTION_IN_API=false
 * so it does not run transcription in-process.
 */
import 'dotenv/config'
import { createConnection } from 'mysql2/promise'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { access } from 'node:fs/promises'

const POLL_MS = 5000
const REPO_ROOT = process.env.REPO_ROOT || join(process.cwd(), '..')
const PYTHON_EXE = process.env.REELS_PYTHON_EXE || (process.platform === 'win32'
  ? join(REPO_ROOT, '.reels-venv', 'Scripts', 'python.exe')
  : join(REPO_ROOT, '.reels-venv', 'bin', 'python'))
const TRANSCRIBE_SCRIPT = join(REPO_ROOT, 'transcribe_clip.py')
const ORDER_CLIPS_DIR = join(REPO_ROOT, 'assets', 'order-clips')

function getDbConfig() {
  return {
    host: process.env.TYPEORM_DATABASE_HOST || 'localhost',
    port: parseInt(process.env.TYPEORM_DATABASE_PORT || '3306', 10),
    user: process.env.TYPEORM_DATABASE_USERNAME || 'user',
    password: process.env.TYPEORM_DATABASE_PASSWORD || '',
    database: process.env.TYPEORM_DATABASE_NAME || 'reelmaker',
  }
}

async function runTranscribe(inputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_EXE, [TRANSCRIBE_SCRIPT, inputPath], {
      cwd: REPO_ROOT,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    proc.on('error', (err) => reject(err))
    proc.on('exit', (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || stdout.trim() || `Exit ${code}`))
      else resolve(stdout.trim())
    })
  })
}

async function fileExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function main() {
  const dbConfig = getDbConfig()
  if (!dbConfig.password) {
    console.error('Missing TYPEORM_DATABASE_PASSWORD (or MYSQL_PASSWORD)')
    process.exit(1)
  }

  if (!(await fileExists(PYTHON_EXE))) {
    console.error(`Python not found at ${PYTHON_EXE}`)
    process.exit(1)
  }
  if (!(await fileExists(TRANSCRIBE_SCRIPT))) {
    console.error(`Transcribe script not found at ${TRANSCRIBE_SCRIPT}`)
    process.exit(1)
  }

  console.log('Transcription worker started. Polling for pending clips...')
  const conn = await createConnection(dbConfig)

  while (true) {
    try {
      const [rows] = await conn.execute(
        `SELECT type, id, filename FROM clips
         WHERE type = 'order' AND transcript_status = 'pending'
         LIMIT 1`
      )
      if (rows.length === 0) {
        await new Promise((r) => setTimeout(r, POLL_MS))
        continue
      }
      const row = rows[0]
      const { type, id: filename, filename: storedFilename } = row
      const inputPath = join(ORDER_CLIPS_DIR, storedFilename || filename)
      if (!(await fileExists(inputPath))) {
        await conn.execute(
          `UPDATE clips SET transcript_status = 'failed', transcript_error = ?, transcript_updated_at = ?
           WHERE type = ? AND id = ?`,
          [`File not found: ${inputPath}`, new Date().toISOString(), type, filename]
        )
        continue
      }

      await conn.execute(
        `UPDATE clips SET transcript_status = 'processing', transcript_error = NULL, transcript_updated_at = ?
         WHERE type = ? AND id = ?`,
        [new Date().toISOString(), type, filename]
      )

      let parsed
      try {
        const stdout = await runTranscribe(inputPath)
        parsed = JSON.parse(stdout)
      } catch (err) {
        const errMsg = (err.message || String(err)).slice(0, 2000)
        await conn.execute(
          `UPDATE clips SET transcript_status = 'failed', transcript_error = ?, transcript_updated_at = ?
           WHERE type = ? AND id = ?`,
          [errMsg, new Date().toISOString(), type, filename]
        )
        console.error(`Transcribe failed for ${filename}:`, errMsg)
        continue
      }

      const text = (parsed?.text || '').trim()
      const segments = Array.isArray(parsed?.segments) ? parsed.segments : []
      const language = (parsed?.language || '').trim()
      const languageProbability = typeof parsed?.language_probability === 'number' ? parsed.language_probability : null
      const now = new Date().toISOString()

      await conn.execute(
        `UPDATE clips SET
           transcript_text = ?, transcript_segments = ?, transcript_status = ?, transcript_error = ?,
           transcript_updated_at = ?, transcript_language = ?, transcript_language_probability = ?
         WHERE type = ? AND id = ?`,
        [
          text || null,
          segments.length ? JSON.stringify(segments) : null,
          text ? 'completed' : 'empty',
          text ? null : 'No speech detected',
          now,
          language || null,
          languageProbability,
          type,
          filename,
        ]
      )

      if (text) {
        await conn.execute(
          `UPDATE orders SET script = ?
           WHERE clip_name = ? AND order_status NOT IN ('declined', 'closed')
           AND (script IS NULL OR TRIM(script) = '')`,
          [text, filename]
        )
      }
      console.log(`Transcribed ${filename} -> ${text ? 'completed' : 'empty'}`)
    } catch (err) {
      console.error('Worker loop error:', err)
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
