/**
 * Run reels_generator.py for a job. Used by the local worker.
 * Requires REPO_ROOT (path to repo), Python in .reels-venv, and job payload from API.
 * Returns { outputFolderName } on success.
 * Optional onProgress(progress, stage) is called when generator stdout reports progress (so API can show real progress).
 */
import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const PROGRESS_BY_STAGE = {
  'Generating voiceover': 2,
  'Preparing timeline': 4,
  'Loading background': 5,
}

function parseProgressFromOutput(chunk, currentProgress, currentStage) {
  let progress = currentProgress
  let stage = currentStage
  const lower = chunk.toLowerCase()

  const reelMatch = chunk.match(/\[REEL\]\s*(.+)/)
  if (reelMatch?.[1]) {
    stage = reelMatch[1].trim()
    progress = Math.max(currentProgress, PROGRESS_BY_STAGE[stage] ?? currentProgress)
  }
  if (lower.includes('moviepy - building video')) {
    progress = Math.max(progress, 6)
    stage = 'Preparing timeline'
  }
  if (lower.includes('moviepy - writing video')) {
    progress = Math.max(progress, 12)
    stage = 'Rendering frames'
  }
  if (lower.includes('moviepy - done')) {
    progress = Math.max(progress, 95)
    stage = 'Finalizing output'
  }
  if (lower.includes('moviepy - video ready')) {
    progress = Math.max(progress, 99)
    stage = 'Wrapping up'
  }

  const percentMatch = chunk.matchAll(/(\d{1,3})(?:\.\d+)?%/g)
  let lastPercent = null
  for (const m of percentMatch) {
    if (m[1]) lastPercent = Number(m[1])
  }
  if (lastPercent != null && !Number.isNaN(lastPercent)) {
    const mapped = Math.floor((lastPercent / 100) * 82) + 12
    progress = Math.max(progress, Math.min(94, mapped))
    stage = 'Rendering frames'
  }

  return progress !== currentProgress || stage !== currentStage ? { progress, stage } : null
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = process.env.REPO_ROOT || path.resolve(__dirname, '../..')
const pythonExe = process.env.REELS_PYTHON_EXE ||
  (process.platform === 'win32'
    ? path.join(repoRoot, '.reels-venv', 'Scripts', 'python.exe')
    : path.join(repoRoot, '.reels-venv', 'bin', 'python'))
const generatorScript = path.join(repoRoot, 'reels_generator.py')
const scriptsDir = path.join(repoRoot, 'scripts')
const outputDir = path.join(repoRoot, 'output')
const orderClipsDir = path.join(repoRoot, 'assets', 'order-clips')
const clipsDir = path.join(repoRoot, 'assets', 'game-clips')

function getOutputDimensions(sizeKey, isLongScript) {
  switch (sizeKey) {
    case 'tablet': return '1024x768'
    case 'laptop': return '1280x800'
    case 'desktop': return '1920x1080'
    default: return isLongScript ? '540x960' : '720x1280'
  }
}

function buildVoiceArgs(job) {
  if (job.voiceEngine === 'none') return ['--voice-engine', 'none']
  if (job.voiceEngine === 'edge') {
    const voice = job.voiceName || 'en-US-GuyNeural'
    return ['--voice-engine', 'edge', '--voice-name', voice, '--edge-rate', '-5']
  }
  if (job.voiceEngine === 'pyttsx3') {
    const rate = job.voiceRate ?? 180
    const args = ['--voice-engine', 'pyttsx3', '--voice-rate', String(rate)]
    if (job.voiceName) args.push('--voice-name', job.voiceName)
    return args
  }
  if (job.voiceEngine === 'piper') {
    const voiceId = job.voiceName || 'en_US-lessac-medium'
    const modelPath = path.join(repoRoot, 'assets', 'voices', 'piper', voiceId, `${voiceId}.onnx`)
    return ['--voice-engine', 'piper', '--voice-name', modelPath]
  }
  return ['--voice-engine', 'edge', '--voice-name', job.voiceName || 'en-US-GuyNeural', '--edge-rate', '-5']
}

export async function runGenerator(job, apiBaseUrl, options = {}) {
  const { onProgress } = options
  await fs.mkdir(scriptsDir, { recursive: true })
  await fs.mkdir(outputDir, { recursive: true })

  const scriptPath = path.join(scriptsDir, `worker-script-${job.id}.txt`)
  await fs.writeFile(scriptPath, `${job.script.trim()}\n`, 'utf8')

  const wordCount = job.script.trim().split(/\s+/).filter(Boolean).length
  const isLongScript = wordCount >= 130
  const sizeKey = job.outputSize || 'phone'
  const outputSize = getOutputDimensions(sizeKey, isLongScript)
  const outputFps = isLongScript ? 20 : 24
  const voiceRate = isLongScript ? Math.max(job.voiceRate || 180, 210) : (job.voiceRate || 180)
  const maxWordsPerChunk = isLongScript ? 14 : 8

  const args = [
    generatorScript,
    '--script', scriptPath,
    '--size', outputSize,
    '--fps', String(outputFps),
    '--render-preset', 'ultrafast',
    '--max-words-per-chunk', String(maxWordsPerChunk),
    ...buildVoiceArgs(job),
  ]

  if (job.title) args.push('--title', job.title)

  const bgMode = job.bgMode || (job.clipName ? 'clip' : 'auto')
  if (bgMode === 'caption') {
    args.push('--caption-bg')
  } else if (bgMode === 'clip' && job.clipName) {
    const orderPath = path.join(orderClipsDir, job.clipName)
    const catalogPath = path.join(clipsDir, job.clipName)
    const orderExists = await fs.access(orderPath).then(() => true).catch(() => false)
    const catalogExists = await fs.access(catalogPath).then(() => true).catch(() => false)
    const clipPath = orderExists ? orderPath : catalogExists ? catalogPath : null
    if (!clipPath) {
      throw new Error(`Clip not found: ${job.clipName}. Ensure it was downloaded from VPS to assets/order-clips/ or assets/game-clips/`)
    }
    const clipDir = orderExists ? orderClipsDir : clipsDir
    args.push('--bg-dir', clipDir, '--bg-clip', clipPath)
  } else {
    args.push('--bg-dir', clipsDir)
  }

  if (job.useClipAudio) {
    args.push('--use-clip-audio')
    const transcriptPath = path.join(scriptsDir, `worker-transcript-${job.id}.json`)
    await fs.writeFile(transcriptPath, JSON.stringify({
      text: job.script,
      segments: job.transcriptSegments || [],
    }), 'utf8')
    args.push('--transcript-json', transcriptPath)
    if (!job.useClipAudioWithNarrator) args.push('--no-narrate-title')
    if (job.useClipAudioWithNarrator) args.push('--clip-audio-plus-narrator')
  }

  args.push('--font-name', job.fontName || 'default')

  const captionPosition = ['top', 'center', 'bottom'].includes(job.scriptPosition) ? job.scriptPosition : 'bottom'
  args.push('--caption-position', captionPosition)
  const style = job.scriptStyle || {}
  if (style.fontScale != null) args.push('--caption-font-scale', String(Number(style.fontScale)))
  if (style.bgOpacity != null) args.push('--caption-bg-opacity', String(Math.max(0, Math.min(255, Number(style.bgOpacity)))))
  const animationMode = typeof style.animationMode === 'string' ? style.animationMode.trim().toLowerCase() : ''
  if (['calming', 'normal', 'extreme'].includes(animationMode)) {
    args.push('--caption-animation', animationMode)
  }

  const verbose = process.env.REELS_PYTHON_VERBOSE === '1' || process.env.WORKER_VERBOSE === '1'
  const startedAt = Date.now()
  let lastProgress = 1
  let lastStage = 'Preparing assets'

  const outputFolderName = await new Promise((resolve, reject) => {
    const proc = spawn(pythonExe, args, { cwd: repoRoot })
    let stdout = ''
    let stderr = ''

    function handleOutput(chunk, isStderr = false) {
      const s = chunk.toString()
      if (isStderr) stderr += s
      else stdout += s
      if (verbose) (isStderr ? process.stderr : process.stdout).write(s)
      if (typeof onProgress === 'function') {
        const update = parseProgressFromOutput(s, lastProgress, lastStage)
        if (update) {
          lastProgress = update.progress
          lastStage = update.stage
          onProgress(update.progress, update.stage).catch(() => {})
        }
      }
    }

    proc.stdout.on('data', (chunk) => handleOutput(chunk, false))
    proc.stderr.on('data', (chunk) => handleOutput(chunk, true))
    proc.on('error', (err) => reject(err))
    proc.on('exit', (code) => {
      const match = stdout.match(/Output folder\s*:\s*(.+)/i)
      const folder = match ? match[1].trim().replace(/\\/g, '/').split('/').pop() : null
      if (code !== 0) {
        reject(new Error(`Generator exited ${code}: ${stderr.trim() || stdout.trim()}`))
        return
      }
      if (!folder) {
        reject(new Error('Could not parse output folder from generator stdout'))
        return
      }
      resolve(folder)
    })
  })

  const folderPath = path.join(outputDir, outputFolderName)
  const videoPath = path.join(folderPath, 'reel.mp4')
  await fs.access(videoPath)
  return { outputFolderName, folderPath }
}

export { outputDir, repoRoot }
