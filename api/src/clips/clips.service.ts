import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { access, mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { Repository } from 'typeorm'

/** Approximate words per second for TTS so script fits video length. Conservative. */
const WORDS_PER_SECOND_FOR_NARRATION = 2.5
import { paths } from '../paths'
import { ClipEntity, type ClipType } from './clip.entity'
import { OrdersService } from '../orders/orders.service'

const ALLOWED_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi'])

function getDir(type: ClipType): string {
  return type === 'game' ? paths.clipsDir : paths.orderClipsDir
}

function getPrefix(type: ClipType): string {
  return type === 'game' ? 'clip-' : 'order-'
}

export interface ClipItemDto {
  /** Filename (identifier); kept as "name" for backward compatibility with existing clients */
  name: string
  /** Friendly display name from DB */
  displayName: string
  filename: string
  size?: number
  createdAt: string
  url: string
}

@Injectable()
export class ClipsService {
  constructor(
    @InjectRepository(ClipEntity)
    private readonly clipRepo: Repository<ClipEntity>,
    private readonly ordersService: OrdersService,
  ) {}

  async list(type: ClipType): Promise<ClipItemDto[]> {
    const dir = getDir(type)
    await mkdir(dir, { recursive: true })
    const entries = await readdir(dir, { withFileTypes: true })
    const files = entries.filter(
      (e) =>
        e.isFile() && ALLOWED_EXT.has(extname(e.name).toLowerCase()),
    )

    const existingIds = new Set(
      (
        await this.clipRepo.find({
          where: { type },
          select: { id: true },
        })
      ).map((r) => r.id),
    )
    const now = new Date().toISOString()
    for (const entry of files) {
      if (!existingIds.has(entry.name)) {
        const name = entry.name.replace(/\.[^.]+$/, '') || entry.name
        await this.clipRepo.insert({
          type,
          id: entry.name,
          name,
          filename: entry.name,
          created_at: now,
        })
      }
    }

    const rows = await this.clipRepo.find({
      where: { type },
      order: { created_at: 'DESC' },
    })

    const result: ClipItemDto[] = []
    const serveRoot = type === 'game' ? '/media/clips' : '/media/order-clips'
    for (const row of rows) {
      const filePath = join(dir, row.filename)
      let size: number | undefined
      try {
        const st = await stat(filePath)
        size = st.size
      } catch {
        // file missing on disk; skip listing
        continue
      }
      result.push({
        name: row.filename,
        displayName: row.name,
        filename: row.filename,
        size,
        createdAt: row.created_at,
        url: `${serveRoot}/${row.filename}`,
      })
    }
    return result
  }

  async upload(type: ClipType, file: Express.Multer.File): Promise<ClipItemDto> {
    if (!file?.originalname) {
      throw new BadRequestException('No file provided')
    }
    const ext = extname(file.originalname).toLowerCase()
    if (!ALLOWED_EXT.has(ext)) {
      throw new BadRequestException(
        `Allowed: .mp4, .mov, .mkv, .webm, .avi. Got: ${ext}`,
      )
    }
    const prefix = getPrefix(type)
    const filename = `${prefix}${Date.now()}-${randomUUID()}${ext}`
    const dir = getDir(type)
    await mkdir(dir, { recursive: true })
    const destPath = join(dir, filename)
    await writeFile(destPath, file.buffer)
    const now = new Date().toISOString()
    const name = filename.replace(/\.[^.]+$/, '') || filename
    await this.clipRepo.upsert(
      {
        type,
        id: filename,
        name,
        filename,
        created_at: now,
        transcript_status: type === 'order' ? 'pending' : null,
      },
      { conflictPaths: ['type', 'id'] },
    )
    const serveRoot = type === 'game' ? '/media/clips' : '/media/order-clips'
    if (type === 'order' && process.env.RUN_TRANSCRIPTION_IN_API !== 'false') {
      void this.transcribeClip(type, filename)
    }
    return {
      name: filename,
      displayName: name,
      filename,
      size: file.buffer?.length,
      createdAt: now,
      url: `${serveRoot}/${filename}`,
    }
  }

  async update(
    type: ClipType,
    id: string,
    dto: { name?: string },
  ): Promise<ClipItemDto> {
    const row = await this.clipRepo.findOne({ where: { type, id } })
    if (!row) {
      throw new NotFoundException(`Clip "${id}" not found`)
    }
    if (dto.name !== undefined && dto.name.trim()) {
      await this.clipRepo.update(
        { type, id },
        { name: dto.name.trim() },
      )
    }
    const updated = await this.clipRepo.findOneOrFail({ where: { type, id } })
    const dir = getDir(type)
    const serveRoot = type === 'game' ? '/media/clips' : '/media/order-clips'
    let size: number | undefined
    try {
      const st = await stat(join(dir, updated.filename))
      size = st.size
    } catch {
      //
    }
    return {
      name: updated.filename,
      displayName: updated.name,
      filename: updated.filename,
      size,
      createdAt: updated.created_at,
      url: `${serveRoot}/${updated.filename}`,
    }
  }

  async delete(type: ClipType, id: string): Promise<void> {
    const row = await this.clipRepo.findOne({ where: { type, id } })
    if (!row) {
      throw new NotFoundException(`Clip "${id}" not found`)
    }
    await this.clipRepo.delete({ type, id })
    const filePath = join(getDir(type), row.filename)
    await unlink(filePath).catch(() => {})
  }

  /** Register a file that was written to disk by another endpoint (e.g. POST /api/clips/upload). */
  async registerFromDisk(type: ClipType, filename: string): Promise<void> {
    const existing = await this.clipRepo.findOne({ where: { type, id: filename } })
    if (existing) return
    const name = filename.replace(/\.[^.]+$/, '') || filename
    const now = new Date().toISOString()
    await this.clipRepo.insert({
      type,
      id: filename,
      name,
      filename,
      created_at: now,
      transcript_status: type === 'order' ? 'pending' : null,
    })
    // Transcription: when RUN_TRANSCRIPTION_IN_API=false, the separate transcription service will pick up pending clips
  }

  async getTranscript(type: ClipType, filename: string): Promise<string | null> {
    const row = await this.clipRepo.findOne({ where: { type, id: filename } })
    const text = row?.transcript_text?.trim()
    return text && text.length > 0 ? text : null
  }

  async getTranscriptData(
    type: ClipType,
    filename: string,
  ): Promise<{ text: string | null; segments: Array<{ start: number; end: number; text: string }> | null }> {
    const row = await this.clipRepo.findOne({ where: { type, id: filename } })
    const text = row?.transcript_text?.trim() ?? ''
    let segments: Array<{ start: number; end: number; text: string }> | null = null
    if (row?.transcript_segments) {
      try {
        const parsed = JSON.parse(row.transcript_segments) as Array<{
          start: number
          end: number
          text: string
        }>
        if (Array.isArray(parsed) && parsed.length > 0) {
          segments = parsed
        }
      } catch {
        segments = null
      }
    }
    return {
      text: text && text.length > 0 ? text : null,
      segments,
    }
  }

  async getTranscriptInfo(type: ClipType, filename: string): Promise<{
    status: string | null
    text: string | null
    error: string | null
    updatedAt: string | null
    language: string | null
    languageProbability: number | null
    /** Video length in seconds (order clips only). Enables "max words" guidance when no speech. */
    durationSeconds?: number | null
    /** Max words for narration so script fits video length (order clips only). */
    maxWordsForNarration?: number | null
  }> {
    const row = await this.clipRepo.findOne({ where: { type, id: filename } })
    if (!row) {
      throw new NotFoundException(`Clip "${filename}" not found`)
    }
    const text = row.transcript_text?.trim() ?? ''
    const base: {
      status: string | null
      text: string | null
      error: string | null
      updatedAt: string | null
      language: string | null
      languageProbability: number | null
      durationSeconds?: number | null
      maxWordsForNarration?: number | null
    } = {
      status: row.transcript_status ?? null,
      text: text && text.length > 0 ? text : null,
      error: row.transcript_error ?? null,
      updatedAt: row.transcript_updated_at ?? null,
      language: row.transcript_language ?? null,
      languageProbability: row.transcript_language_probability ?? null,
    }
    if (type === 'order') {
      const inputPath = join(getDir(type), row.filename)
      if (await this.fileExists(inputPath)) {
        const durationSeconds = await this.getVideoDurationSeconds(inputPath)
        if (durationSeconds != null) {
          base.durationSeconds = durationSeconds
          base.maxWordsForNarration = this.maxWordsForDurationSeconds(durationSeconds)
        }
      }
    }
    return base
  }

  async transcribeClip(type: ClipType, filename: string): Promise<void> {
    if (type !== 'order') {
      return
    }
    const row = await this.clipRepo.findOne({ where: { type, id: filename } })
    if (!row) return
    if (row.transcript_status === 'processing') return
    if (row.transcript_status === 'completed' && row.transcript_text) return

    const now = new Date().toISOString()
    await this.clipRepo.update(
      { type, id: filename },
      {
        transcript_status: 'processing',
        transcript_error: null,
        transcript_updated_at: now,
      },
    )

    const inputPath = join(getDir(type), row.filename)
    if (!(await this.fileExists(paths.pythonExe))) {
      await this.clipRepo.update(
        { type, id: filename },
        {
          transcript_status: 'failed',
          transcript_error: `Missing python: ${paths.pythonExe}`,
          transcript_updated_at: new Date().toISOString(),
        },
      )
      return
    }
    if (!(await this.fileExists(paths.transcribeScript))) {
      await this.clipRepo.update(
        { type, id: filename },
        {
          transcript_status: 'failed',
          transcript_error: `Missing transcription script: ${paths.transcribeScript}`,
          transcript_updated_at: new Date().toISOString(),
        },
      )
      return
    }

    let stdout = ''
    let stderr = ''
    const result = await new Promise<{ code: number | null }>((resolve) => {
      const proc = spawn(paths.pythonExe, [paths.transcribeScript, inputPath], {
        cwd: paths.repoRoot,
        windowsHide: true,
      })
      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      proc.on('error', (err) => {
        stderr += String(err)
        resolve({ code: 1 })
      })
      proc.on('exit', (code) => resolve({ code }))
    })

    if (result.code !== 0) {
      await this.clipRepo.update(
        { type, id: filename },
        {
          transcript_status: 'failed',
          transcript_error: stderr.trim() || stdout.trim() || 'Transcription failed',
          transcript_updated_at: new Date().toISOString(),
        },
      )
      return
    }

    let parsed: {
      text?: string
      segments?: Array<{ start: number; end: number; text: string }>
      language?: string
      language_probability?: number
    } | null = null
    try {
      parsed = JSON.parse(stdout.trim())
    } catch {
      parsed = null
    }
    const text = parsed?.text?.trim() ?? ''
    const segments = Array.isArray(parsed?.segments) ? parsed?.segments ?? [] : []
    const language = parsed?.language?.trim() ?? ''
    const languageProbability =
      typeof parsed?.language_probability === 'number'
        ? parsed?.language_probability
        : null
    await this.clipRepo.update(
      { type, id: filename },
      {
        transcript_text: text || null,
        transcript_segments: segments.length ? JSON.stringify(segments) : null,
        transcript_status: text ? 'completed' : 'empty',
        transcript_error: text ? null : 'No speech detected',
        transcript_updated_at: new Date().toISOString(),
        transcript_language: language || null,
        transcript_language_probability: languageProbability,
      },
    )
    if (text) {
      await this.ordersService.applyTranscriptToClipOrders(filename, text)
    }
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get video duration in seconds via ffprobe. Returns null if ffprobe fails or file is missing.
   */
  private getVideoDurationSeconds(filePath: string): Promise<number | null> {
    return new Promise((resolve) => {
      const proc = spawn(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          filePath,
        ],
        { windowsHide: true },
      )
      let stdout = ''
      let stderr = ''
      proc.stdout?.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      proc.stderr?.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      proc.on('error', () => resolve(null))
      proc.on('exit', (code) => {
        if (code !== 0) return resolve(null)
        const s = stdout.trim()
        const n = parseFloat(s)
        resolve(Number.isFinite(n) && n > 0 ? n : null)
      })
    })
  }

  /**
   * Max words that fit in the given duration at typical TTS pace (so script matches video span).
   */
  private maxWordsForDurationSeconds(seconds: number): number {
    return Math.max(0, Math.floor(seconds * WORDS_PER_SECOND_FOR_NARRATION))
  }

  /**
   * Delete all order clips: DB rows with type 'order' and all files in orderClipsDir.
   * Returns the number of clip records deleted.
   */
  async deleteAllOrderClips(): Promise<number> {
    const dir = paths.orderClipsDir
    await mkdir(dir, { recursive: true })
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile()) {
        try {
          await unlink(join(dir, entry.name))
        } catch {
          // continue
        }
      }
    }
    const result = await this.clipRepo.delete({ type: 'order' })
    return result.affected ?? 0
  }
}
