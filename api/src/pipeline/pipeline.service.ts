import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { extname } from 'node:path'
import { Repository } from 'typeorm'
import { AccountsService } from '../accounts/accounts.service'
import { ReelsService } from '../reels/reels.service'
import { FacebookService } from '../facebook/facebook.service'
import { CaptionsService, Lang } from '../captions/captions.service'
import { paths } from '../paths'
import { PipelineConfigEntity } from './pipeline-config.entity'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Pipeline {
  id: string
  label: string
  enabled: boolean
  nicheId: string
  facebookAccountId: string
  /** When set, post only to these page IDs; when null/empty, post to all pages the account manages */
  facebookPageIds: string[] | null
  voiceEngine: string
  voiceName: string
  fontName: string
  ollamaModel: string
  lang: Lang
  intervalHours: number
  createdAt: string
  lastRunAt: string | null
  lastRunStatus: string | null
  lastRunError: string | null
}

export type PipelineUpsert = Omit<Pipeline, 'id' | 'createdAt' | 'lastRunAt' | 'lastRunStatus' | 'lastRunError'>

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 3000
const JOB_TIMEOUT_MS = 20 * 60 * 1000

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name)

  /** Track which pipeline IDs are currently executing to prevent overlap */
  private readonly running = new Set<string>()
  /** IDs that have been stop-requested — runPipeline will abort early for these */
  private readonly stopRequested = new Set<string>()

  constructor(
    @InjectRepository(PipelineConfigEntity)
    private readonly pipelineRepo: Repository<PipelineConfigEntity>,
    private readonly accountsService: AccountsService,
    private readonly reelsService: ReelsService,
    private readonly facebookService: FacebookService,
    private readonly captionsService: CaptionsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Cron master tick — runs every 5 minutes, checks each pipeline's schedule
  // ---------------------------------------------------------------------------

  @Cron('0 */5 * * * *')
  async cronTick() {
    const pipelines = (await this.listPipelines()).filter((p) => p.enabled)
    if (pipelines.length === 0) return

    const now = Date.now()
    for (const pipeline of pipelines) {
      if (this.running.has(pipeline.id)) continue

      // Use the per-pipeline intervalHours setting (minimum 30 minutes)
      const intervalHours = Math.max(0.5, pipeline.intervalHours ?? 0.5)
      const intervalMs = intervalHours * 60 * 60 * 1000
      const lastRun = pipeline.lastRunAt ? new Date(pipeline.lastRunAt).getTime() : 0
      if (now - lastRun >= intervalMs) {
        this.logger.log(`[Cron] Triggering pipeline "${pipeline.label}" (${pipeline.id}) — interval ${intervalHours}h`)
        void this.runPipeline(pipeline.id)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async listPipelines(): Promise<Pipeline[]> {
    const rows = await this.pipelineRepo.find({ order: { created_at: 'ASC' } })
    return rows.map((row) => this.mapRow(row))
  }

  async getPipeline(id: string): Promise<Pipeline> {
    const row = await this.pipelineRepo.findOne({ where: { id } })
    if (!row) throw new NotFoundException(`Pipeline "${id}" not found`)
    return this.mapRow(row)
  }

  async createPipeline(data: Partial<PipelineUpsert> & { label: string }): Promise<Pipeline> {
    const id = randomUUID()
    const now = new Date().toISOString()
    const pageIdsJson = data.facebookPageIds?.length
      ? JSON.stringify(data.facebookPageIds)
      : null
    await this.pipelineRepo.insert({
      id,
      label: data.label,
      enabled: data.enabled ? 1 : 0,
      niche_id: data.nicheId ?? 'gaming',
      facebook_account_id: data.facebookAccountId ?? '',
      facebook_page_ids: pageIdsJson,
      voice_engine: data.voiceEngine ?? 'edge',
      voice_name: data.voiceName ?? 'en-US-GuyNeural',
      font_name: data.fontName ?? 'default',
      ollama_model: data.ollamaModel ?? 'llama3',
      lang: data.lang ?? 'auto',
      interval_hours: data.intervalHours ?? 0.5,
      created_at: now,
    })
    return this.getPipeline(id)
  }

  async ensurePipelineForNiche(nicheId: string, nicheLabel: string): Promise<Pipeline> {
    const all = await this.listPipelines()
    const existing = all.find((p) => p.nicheId === nicheId)
    if (existing) return existing
    const defaultFbAccount = (await this.accountsService.getFirstConnectedId('facebook')) ?? ''
    return this.createPipeline({
      label: `${nicheLabel} Pipeline`,
      enabled: false,
      nicheId,
      facebookAccountId: defaultFbAccount,
      voiceEngine: 'edge',
      voiceName: 'en-US-GuyNeural',
      fontName: 'Kidmania Trial Regular.otf',
      ollamaModel: 'llama3',
      lang: 'auto',
      intervalHours: 0.5,
    })
  }

  async updatePipeline(id: string, data: Partial<PipelineUpsert>): Promise<Pipeline> {
    const current = await this.getPipeline(id)
    const pageIdsJson = data.facebookPageIds !== undefined
      ? (data.facebookPageIds?.length ? JSON.stringify(data.facebookPageIds) : null)
      : (current.facebookPageIds?.length ? JSON.stringify(current.facebookPageIds) : null)
    await this.pipelineRepo.update(id, {
      label: data.label ?? current.label,
      enabled: (data.enabled ?? current.enabled) ? 1 : 0,
      niche_id: data.nicheId ?? current.nicheId,
      facebook_account_id: data.facebookAccountId ?? current.facebookAccountId,
      facebook_page_ids: pageIdsJson,
      voice_engine: data.voiceEngine ?? current.voiceEngine,
      voice_name: data.voiceName ?? current.voiceName,
      font_name: data.fontName ?? current.fontName,
      ollama_model: data.ollamaModel ?? current.ollamaModel,
      lang: data.lang ?? current.lang,
      interval_hours: data.intervalHours ?? current.intervalHours,
    })
    return this.getPipeline(id)
  }

  async deletePipeline(id: string): Promise<void> {
    const result = await this.pipelineRepo.delete(id)
    if (result.affected === 0) throw new NotFoundException(`Pipeline "${id}" not found`)
  }

  async getStatus(id: string): Promise<Pipeline & { isRunning: boolean }> {
    return { ...(await this.getPipeline(id)), isRunning: this.running.has(id) }
  }

  // ---------------------------------------------------------------------------
  // Run all / Stop all
  // ---------------------------------------------------------------------------

  async runAll(): Promise<{ queued: string[] }> {
    const all = await this.listPipelines()
    const queued: string[] = []
    for (const p of all) {
      if (this.running.has(p.id)) continue
      this.stopRequested.delete(p.id)
      queued.push(p.id)
      void this.runPipeline(p.id)
    }
    this.logger.log(`[RunAll] Queued ${queued.length} pipeline(s)`)
    return { queued }
  }

  stopAll(): { stopped: string[] } {
    const stopped: string[] = []
    for (const id of this.running) {
      this.stopRequested.add(id)
      stopped.push(id)
    }
    this.logger.log(`[StopAll] Stop-requested ${stopped.length} pipeline(s)`)
    return { stopped }
  }

  /** Request stop for a specific pipeline. No-op if not running. */
  stopPipeline(id: string): { stopped: boolean } {
    if (!this.running.has(id)) {
      return { stopped: false }
    }
    this.stopRequested.add(id)
    this.logger.log(`[Pipeline:${id}] Stop requested`)
    return { stopped: true }
  }

  // ---------------------------------------------------------------------------
  // Run a specific pipeline
  // ---------------------------------------------------------------------------

  async runPipeline(id: string, options?: { forceReel?: boolean }): Promise<void> {
    if (this.running.has(id)) {
      this.logger.warn(`[Pipeline:${id}] Already running — skipping`)
      return
    }

    this.running.add(id)
    this.stopRequested.delete(id)
    await this.updateRunStatus(id, 'running', null)

    const checkStop = () => {
      if (this.stopRequested.has(id)) {
        this.stopRequested.delete(id)
        throw new Error('Pipeline stopped by user.')
      }
    }

    try {
      const config = await this.getPipeline(id)

      checkStop()

      // 1. Generate script from this pipeline's configured niche
      const scriptNicheId = config.nicheId
      this.logger.log(`[Pipeline:${config.label}] Generating script for niche: ${scriptNicheId}`)
      const scriptResult = await this.captionsService.suggestScript(
        scriptNicheId,
        config.ollamaModel,
        config.lang ?? 'auto',
      )

      checkStop()

      // 1b. When the RSS item has an image, post that image with the article content instead of creating a reel
      //     (skip when forceReel is true, or when the image looks low-quality — make a reel instead)
      const hasFacebookAccount = Boolean(config.facebookAccountId?.trim())
      const useImagePost =
        hasFacebookAccount &&
        !options?.forceReel &&
        scriptResult.imageUrl &&
        scriptResult.articleCaption &&
        !this.isLowQualityImageUrl(scriptResult.imageUrl)
      if (useImagePost) {
        this.logger.log(`[Pipeline:${config.label}] RSS item has image — posting image with article content instead of reel`)
        const result = await this.facebookService.uploadPhotoToFacebookPage({
          accountId: config.facebookAccountId,
          imageUrl: scriptResult.imageUrl ?? '',
          caption: scriptResult.articleCaption ?? '',
          ...(config.facebookPageIds?.length && { pageIds: config.facebookPageIds }),
        })
        this.logger.log(`[Pipeline:${config.label}] Image post done — ${result.facebookUrl}`)
        await this.updateRunStatus(id, 'success', null)
        return
      }
      if (
        scriptResult.imageUrl &&
        scriptResult.articleCaption &&
        this.isLowQualityImageUrl(scriptResult.imageUrl)
      ) {
        this.logger.log(`[Pipeline:${config.label}] RSS image looks low-quality — making reel instead`)
      }

      const { script, title } = scriptResult

      // 2. Randomly pick background mode.
      //    When clips exist, heavily favour real video (auto=2, clip=2, caption=1).
      //    When no clips are uploaded, fall back to caption-driven gradient.
      const randomClip = await this.pickRandomClip()
      const bgOptions: Array<'caption' | 'auto' | 'clip'> = randomClip
        ? ['auto', 'auto', 'clip', 'clip', 'caption']
        : ['caption']
      const bgMode = bgOptions[Math.floor(Math.random() * bgOptions.length)]
      // For 'clip' mode pass the specific clip name; for others leave undefined.
      const clipName = bgMode === 'clip' ? randomClip : undefined
      this.logger.log(`[Pipeline:${config.label}] Background mode: ${bgMode}${clipName ? ` (${clipName})` : ''}`)

      // 3. Create reel job
      const rawEngine = config.voiceEngine?.trim()
      const voiceEngine: 'edge' | 'pyttsx3' | 'piper' =
        rawEngine === 'pyttsx3' ? 'pyttsx3'
        : rawEngine === 'piper' ? 'piper'
        : 'edge'

      const nicheRow = await this.captionsService.getNiche(config.nicheId)
      const job = await this.reelsService.createJob({
        script,
        title,
        clipName,
        voiceEngine,
        voiceName: config.voiceName || 'en-US-GuyNeural',
        fontName: config.fontName || 'default',
        bgMode,
        nicheId: config.nicheId,
        nicheLabel: nicheRow.label,
      })

      // 4 + 5. Wait for render AND generate caption concurrently.
      //        Caption is generated for the SAME niche and SAME article (headline) as the reel — not random.
      this.logger.log(
        `[Pipeline:${config.label}] Waiting for job ${job.id} & generating caption for same article`,
      )
      const [completedJob, captionResult] = await Promise.all([
        this.waitForJob(job.id),
        this.captionsService
          .suggestCaptionForArticle(
            scriptNicheId,
            scriptResult.headline,
            config.ollamaModel,
            config.lang ?? 'auto',
          )
          .catch((err) => {
            this.logger.warn(`[Pipeline:${config.label}] Caption generation failed, using fallback: ${String(err)}`)
            return { caption: title ?? script.slice(0, 200) }
          }),
      ])

      if (completedJob.status === 'failed') {
        throw new Error(completedJob.error ?? 'Reel generation failed')
      }

      const reelId = completedJob.outputFolder ?? job.id
      this.logger.log(`[Pipeline:${config.label}] Reel ready: ${reelId}`)
      const { caption: rawCaption } = captionResult
      const caption = CaptionsService.prepareCaptionForPost(rawCaption)
      this.logger.log(`[Pipeline:${config.label}] Caption: ${caption.slice(0, 120).replace(/\n/g, ' | ')}`)

      // 6. Await approval before posting the reel to Facebook pages.
      //    If no Facebook account is connected, just finish and keep the reel saved.
      if (hasFacebookAccount) {
        this.logger.log(`[Pipeline:${config.label}] Reel ready — awaiting approval before Facebook upload`)
        await this.updateRunStatus(id, 'pending-approval', null)
      } else {
        this.logger.log(`[Pipeline:${config.label}] Reel ready — no Facebook account connected, skipping upload`)
        await this.updateRunStatus(id, 'success', null)
      }
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`[Pipeline:${id}] Failed: ${message}`)
      await this.updateRunStatus(id, 'failed', message)
    } finally {
      this.running.delete(id)
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Heuristic: treat RSS image as low-quality (thumbnail) so we make a reel instead of posting it.
   * Checks URL for small size params (e.g. w=32, ?width=64) or path/query words like thumb, small, icon.
   */
  private isLowQualityImageUrl(url: string): boolean {
    if (!url?.trim()) return false
    const lower = url.toLowerCase()
    // Common thumbnail/small size query params: w=32, width=64, h=48, height=100
    const sizeMatch = url.match(/(?:^|[?&])(?:w|width|h|height)=(\d+)/i)
    if (sizeMatch?.[1]) {
      const n = parseInt(sizeMatch[1], 10)
      if (n > 0 && n < 400) return true
    }
    // Path or query suggests thumbnail/small/icon
    if (/\b(thumb|thumbnail|small|icon|avatar|favicon)\b/i.test(lower)) return true
    return false
  }

  private async pickRandomClip(): Promise<string | undefined> {
    try {
      const allowed = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi'])
      const entries = await readdir(paths.clipsDir, { withFileTypes: true })
      const clips = entries
        .filter((e) => e.isFile() && allowed.has(extname(e.name).toLowerCase()))
        .map((e) => e.name)
      if (clips.length === 0) return undefined
      return clips[Math.floor(Math.random() * clips.length)]
    } catch {
      return undefined
    }
  }

  private async pickRandomNicheId(fallback: string): Promise<string> {
    const niches = await this.captionsService.listNiches()
    if (niches.length === 0) return fallback
    return niches[Math.floor(Math.random() * niches.length)].id
  }

  private async waitForJob(jobId: string): Promise<ReturnType<ReelsService['getJob']>> {
    const deadline = Date.now() + JOB_TIMEOUT_MS
    while (Date.now() < deadline) {
      await this.sleep(POLL_INTERVAL_MS)
      const job = this.reelsService.getJob(jobId)
      if (job.status === 'completed' || job.status === 'failed') return job
    }
    throw new Error(`Job ${jobId} timed out after ${JOB_TIMEOUT_MS / 60000} minutes`)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async updateRunStatus(id: string, status: string, error: string | null): Promise<void> {
    await this.pipelineRepo.update(id, {
      last_run_at: new Date().toISOString(),
      last_run_status: status,
      last_run_error: error,
    })
  }

  private mapRow(row: PipelineConfigEntity): Pipeline {
    let facebookPageIds: string[] | null = null
    if (row.facebook_page_ids) {
      try {
        const parsed = JSON.parse(row.facebook_page_ids) as string[]
        if (Array.isArray(parsed) && parsed.length > 0) facebookPageIds = parsed
      } catch { /* ignore */ }
    }
    return {
      id: row.id,
      label: row.label ?? 'Pipeline',
      enabled: row.enabled === 1,
      nicheId: row.niche_id,
      facebookAccountId: row.facebook_account_id,
      facebookPageIds,
      voiceEngine: row.voice_engine,
      voiceName: row.voice_name,
      fontName: row.font_name,
      ollamaModel: row.ollama_model,
      lang: (row.lang as Lang) ?? 'auto',
      intervalHours: row.interval_hours ?? 0.5,
      createdAt: row.created_at,
      lastRunAt: row.last_run_at,
      lastRunStatus: row.last_run_status,
      lastRunError: row.last_run_error,
    }
  }
}
