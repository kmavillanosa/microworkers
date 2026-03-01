import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Repository } from 'typeorm';
import { paths } from '../paths';
import { FontEntity } from '../fonts/font.entity';
import { OrdersService } from '../orders/orders.service';
import { CreateReelDto } from './dto/create-reel.dto';
import { piperVoiceCatalog } from './piper-catalog';
import { BgMode, ReelItem, ReelJob, UploadPlatform, UploadRecord, VoiceEngine } from './reels.types';
import { ReelJobEntity } from './reel-job.entity';

interface LocalVoice {
  id: string;
  name: string;
}

interface ReelMeta {
  uploaded?: boolean;
  uploadedAt?: string;
  youtubeUrl?: string;
  uploadLog?: UploadRecord[];
  nicheId?: string;
  nicheLabel?: string;
  /** Optional originating order id for this reel, if any. */
  orderId?: string;
  /** When true, this reel appears on web-orders showcase with title and description. */
  showcase?: boolean;
  showcaseTitle?: string;
  showcaseDescription?: string;
}

export interface FontItem {
  id: string;
  name: string;
  filename?: string;
  source: 'custom' | 'builtin';
}

const edgeNarratorPresets = [
  {
    id: 'en-US-GuyNeural',
    name: 'American Narrator (Guy Neural)',
    locale: 'en-US',
  },
  {
    id: 'en-US-AriaNeural',
    name: 'American Narrator (Aria Neural)',
    locale: 'en-US',
  },
  {
    id: 'en-US-JennyNeural',
    name: 'American Narrator (Jenny Neural)',
    locale: 'en-US',
  },
  {
    id: 'en-US-DavisNeural',
    name: 'American Narrator (Davis Neural)',
    locale: 'en-US',
  },
  {
    id: 'en-US-TonyNeural',
    name: 'American Narrator (Tony Neural)',
    locale: 'en-US',
  },
  {
    id: 'en-GB-RyanNeural',
    name: 'British Narrator (Ryan Neural)',
    locale: 'en-GB',
  },
  {
    id: 'en-GB-SoniaNeural',
    name: 'British Narrator (Sonia Neural)',
    locale: 'en-GB',
  },
  {
    id: 'fil-PH-BlessicaNeural',
    name: 'Filipino Narrator (Blessica Neural)',
    locale: 'fil-PH',
  },
  {
    id: 'fil-PH-AngeloNeural',
    name: 'Filipino Narrator (Angelo Neural)',
    locale: 'fil-PH',
  },
] as const;

@Injectable()
export class ReelsService {
  private readonly logger = new Logger(ReelsService.name);
  private readonly jobs = new Map<string, ReelJob>();
  private readonly queue: string[] = [];
  /** Max number of Python generator processes running at once (default 5). */
  private readonly maxConcurrentJobs: number = (() => {
    const raw = process.env.REELS_MAX_CONCURRENT_JOBS;
    if (raw == null || raw === '') return 5;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 20) : 5;
  })();
  private runningCount = 0;
  private readonly jobTimeoutMs = 15 * 60 * 1000;
  private readonly pythonVerbose = process.env.REELS_PYTHON_VERBOSE === '1';
  /** When false (e.g. on VPS), jobs are queued in DB only; a local worker runs generation and uploads output. */
  private readonly runInProcess = process.env.REELS_RUN_IN_PROCESS !== 'false';

  constructor(
    @InjectRepository(FontEntity)
    private readonly fontRepo: Repository<FontEntity>,
    @InjectRepository(ReelJobEntity)
    private readonly reelJobRepo: Repository<ReelJobEntity>,
    private readonly ordersService: OrdersService,
  ) {}

  async listVoices(): Promise<any> {
    await this.ensureDirectories();
    const pyttsx3 = await this.listPyttsx3Voices();
    const piperInstalled = await this.listInstalledPiperVoices();
    const installedSet = new Set(piperInstalled.map((voice) => voice.id));

    return {
      defaultEngine: 'edge' as const,
      defaultVoiceId: 'en-US-GuyNeural',
      pyttsx3,
      edge: edgeNarratorPresets,
      piper: {
        installed: piperInstalled,
        catalog: piperVoiceCatalog.map((voice) => ({
          ...voice,
          installed: installedSet.has(voice.id),
        })),
      },
    };
  }

  async listFonts(): Promise<{ defaultFont: string; items: FontItem[] }> {
    await this.ensureDirectories();
    const files = await readdir(paths.fontsDir, { withFileTypes: true }).catch(
      (): import('node:fs').Dirent[] => [],
    );
    const fontFiles = files
      .filter((entry) => entry.isFile())
      .filter((entry) => ['.ttf', '.otf'].includes(extname(entry.name).toLowerCase()));

    const now = new Date().toISOString();
    const existingIds = new Set(
      (await this.fontRepo.find({ select: { id: true } })).map((r) => r.id),
    );
    for (const entry of fontFiles) {
      if (!existingIds.has(entry.name)) {
        await this.fontRepo.insert({
          id: entry.name,
          name: entry.name.replace(/\.[^.]+$/, '') || entry.name,
          filename: entry.name,
          created_at: now,
        });
      }
    }

    const dbFonts = await this.fontRepo.find({ order: { name: 'ASC' } });
    const customFonts: FontItem[] = dbFonts.map((row) => ({
      id: row.id,
      name: row.name,
      filename: row.filename,
      source: 'custom' as const,
    }));

    const builtinFonts: FontItem[] = [
      { id: 'default', name: 'System fallback', source: 'builtin' },
    ];

    const kidmania = customFonts.find((f) =>
      f.filename?.toLowerCase().includes('kidmania'),
    );
    const defaultFont = kidmania?.id ?? customFonts[0]?.id ?? 'default';

    return {
      defaultFont,
      items: [...customFonts, ...builtinFonts],
    };
  }

  async installPiperVoice(voiceId: string) {
    await this.ensureDirectories();
    const voice = piperVoiceCatalog.find((item) => item.id === voiceId);
    if (!voice) {
      throw new NotFoundException('Voice not found in Piper catalog');
    }

    const targetDir = join(paths.piperVoicesDir, voice.id);
    await mkdir(targetDir, { recursive: true });
    const modelPath = join(targetDir, `${voice.id}.onnx`);
    const configPath = `${modelPath}.json`;

    await this.downloadFileIfMissing(voice.modelUrl, modelPath);
    await this.downloadFileIfMissing(voice.configUrl, configPath);
    this.logger.log(`Installed Piper voice ${voice.id} at ${modelPath}`);

    return {
      id: voice.id,
      name: voice.name,
      modelPath,
      installed: true,
    };
  }

  async createJob(dto: CreateReelDto): Promise<ReelJob> {
    await this.ensureDirectories();

    const id = randomUUID();
    const now = new Date().toISOString();
    const useClipOnly =
      dto.useClipAudio === true && !dto.useClipAudioWithNarrator;
    const voiceEngine: VoiceEngine = useClipOnly
      ? 'none'
      : (dto.voiceEngine ?? 'piper');
    const voiceName = useClipOnly ? undefined : dto.voiceName?.trim() || undefined;
    const bgMode: BgMode = dto.bgMode ?? (dto.clipName ? 'clip' : 'auto');
    const job: ReelJob = {
      id,
      script: dto.script,
      title: dto.title?.trim() || undefined,
      clipName: dto.clipName?.trim() || undefined,
      fontName: dto.fontName?.trim() || undefined,
      voiceEngine,
      voiceName,
      voiceRate: dto.voiceRate ?? 180,
      bgMode,
      status: 'queued',
      progress: 0,
      stage: 'Queued',
      createdAt: now,
      updatedAt: now,
      ...(dto.useClipAudio !== undefined && { useClipAudio: dto.useClipAudio }),
      ...(dto.useClipAudioWithNarrator && { useClipAudioWithNarrator: true }),
      ...(dto.transcriptSegments?.length && {
        transcriptSegments: dto.transcriptSegments,
      }),
      ...(dto.nicheId && { nicheId: dto.nicheId }),
      ...(dto.nicheLabel && { nicheLabel: dto.nicheLabel }),
      ...(dto.orderId && { orderId: dto.orderId }),
      ...(dto.outputSize && { outputSize: dto.outputSize }),
    };

    this.jobs.set(id, job);
    if (this.runInProcess) {
      this.queue.push(id);
      this.logger.log(
        `Queued reel job ${id} (engine=${voiceEngine}, bgMode=${bgMode}, clip=${job.clipName ?? 'auto'}, font=${job.fontName ?? 'default'}, queue=${this.queue.length})`,
      );
      this.processQueue();
    } else {
      await this.persistJobToDb(job);
      this.logger.log(
        `Queued reel job ${id} for worker (engine=${voiceEngine}, bgMode=${bgMode}). Set REELS_RUN_IN_PROCESS=false; local worker will process.`,
      );
    }
    return job;
  }

  async getJob(jobId: string): Promise<ReelJob> {
    const fromMemory = this.jobs.get(jobId);
    if (fromMemory) return fromMemory;
    const entity = await this.reelJobRepo.findOne({ where: { id: jobId } });
    if (!entity) throw new NotFoundException('Job not found');
    return this.entityToJob(entity);
  }

  async listReels(): Promise<ReelItem[]> {
    await this.ensureDirectories();
    const entries = await readdir(paths.outputDir, { withFileTypes: true });
    const folders = entries.filter((entry) => entry.isDirectory());

    const items: ReelItem[] = [];
    for (const folder of folders) {
      const folderPath = join(paths.outputDir, folder.name);
      const files = await readdir(folderPath, { withFileTypes: true });
      const hasVideo = files.some(
        (file) => file.isFile() && extname(file.name).toLowerCase() === '.mp4',
      );
      if (!hasVideo) {
        continue;
      }

      const reelStat = await stat(folderPath);
      const meta = await this.readReelMeta(folder.name);
      const hasAudioFile = files.some(
        (f) => f.isFile() && f.name.toLowerCase() === 'reel-audio.wav',
      );
      items.push({
        id: folder.name,
        folder: folder.name,
        createdAt: reelStat.birthtime.toISOString(),
        videoUrl: `/media/output/${folder.name}/reel.mp4`,
        srtUrl: `/media/output/${folder.name}/reel.srt`,
        txtUrl: `/media/output/${folder.name}/reel.txt`,
        ...(hasAudioFile && {
          audioUrl: `/media/output/${folder.name}/reel-audio.wav`,
        }),
        uploaded: meta.uploaded ?? false,
        uploadedAt: meta.uploadedAt,
        youtubeUrl: meta.youtubeUrl,
        uploadLog: meta.uploadLog ?? [],
        ...(meta.nicheId && { nicheId: meta.nicheId }),
        ...(meta.nicheLabel && { nicheLabel: meta.nicheLabel }),
        ...(meta.orderId && { orderId: meta.orderId }),
        ...(meta.showcase && { showcase: true }),
        ...(meta.showcaseTitle != null && { showcaseTitle: meta.showcaseTitle }),
        ...(meta.showcaseDescription != null && {
          showcaseDescription: meta.showcaseDescription,
        }),
      });
    }

    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return items;
  }

  /** Reels that belong to the given order (for customer receipt downloads). */
  async listReelsByOrderId(orderId: string): Promise<ReelItem[]> {
    const all = await this.listReels();
    return all.filter((r) => r.orderId === orderId);
  }

  /** Reels marked for showcase (public list for web-orders landing). */
  async listShowcaseReels(): Promise<
    Array<{ id: string; videoUrl: string; title: string; description: string }>
  > {
    const all = await this.listReels();
    return all
      .filter((r) => r.showcase)
      .map((r) => ({
        id: r.id,
        videoUrl: r.videoUrl,
        title: r.showcaseTitle ?? r.folder,
        description: r.showcaseDescription ?? '',
      }));
  }

  /** Update showcase flag and optional title/description for a reel. */
  async updateShowcase(
    reelId: string,
    payload: { showcase: boolean; showcaseTitle?: string; showcaseDescription?: string },
  ): Promise<void> {
    const all = await this.listReels();
    if (!all.some((r) => r.id === reelId)) {
      throw new NotFoundException('Reel not found');
    }
    const meta = await this.readReelMeta(reelId);
    await this.writeReelMeta(reelId, {
      ...meta,
      showcase: payload.showcase,
      ...(payload.showcaseTitle !== undefined && {
        showcaseTitle: payload.showcaseTitle,
      }),
      ...(payload.showcaseDescription !== undefined && {
        showcaseDescription: payload.showcaseDescription,
      }),
    });
  }

  /**
   * Returns true if this reel has already been uploaded to the given
   * platform + accountId combination, preventing duplicate posts.
   */
  async isAlreadyUploaded(
    reelId: string,
    platform: UploadPlatform,
    accountId: string,
    pageId?: string,
  ): Promise<boolean> {
    const meta = await this.readReelMeta(reelId);
    return (meta.uploadLog ?? []).some(
      (r) =>
        r.platform === platform &&
        r.accountId === accountId &&
        (pageId ? r.pageId === pageId : true),
    );
  }

  /**
   * Record a successful upload to a platform so future calls can detect duplicates.
   * For Facebook, pass pageId to track per-page granularity.
   */
  async recordUpload(
    reelId: string,
    platform: UploadPlatform,
    accountId: string,
    url: string,
    pageId?: string,
  ): Promise<void> {
    const meta = await this.readReelMeta(reelId);
    const log = meta.uploadLog ?? [];
    // Upsert — replace existing record for same platform+account+page if present
    const idx = log.findIndex(
      (r) => r.platform === platform && r.accountId === accountId && r.pageId === pageId,
    );
    const record: UploadRecord = {
      platform,
      accountId,
      pageId,
      url,
      uploadedAt: new Date().toISOString(),
    };
    if (idx >= 0) {
      log[idx] = record;
    } else {
      log.push(record);
    }
    await this.writeReelMeta(reelId, {
      ...meta,
      uploadLog: log,
      // Keep legacy flags in sync
      uploaded: true,
      uploadedAt: meta.uploadedAt ?? record.uploadedAt,
    });
  }

  async markReelUploaded(
    reelId: string,
    options: { uploaded: boolean; youtubeUrl?: string },
  ): Promise<ReelItem> {
    await this.ensureDirectories();
    const folderPath = join(paths.outputDir, reelId);
    if (!(await this.fileExists(folderPath))) {
      throw new NotFoundException('Reel folder not found');
    }
    const videoPath = join(folderPath, 'reel.mp4');
    if (!(await this.fileExists(videoPath))) {
      throw new NotFoundException('Reel video not found');
    }

    const previousMeta = await this.readReelMeta(reelId);
    const uploadedAt = options.uploaded
      ? previousMeta.uploadedAt ?? new Date().toISOString()
      : undefined;
    const nextMeta: ReelMeta = {
      ...previousMeta,
      uploaded: options.uploaded,
      uploadedAt,
      youtubeUrl:
        options.uploaded && options.youtubeUrl
          ? options.youtubeUrl
          : options.uploaded
            ? previousMeta.youtubeUrl
            : undefined,
    };

    await this.writeReelMeta(reelId, nextMeta);
    const reels = await this.listReels();
    const item = reels.find((reel) => reel.id === reelId);
    if (!item) {
      throw new NotFoundException('Reel not found after update');
    }
    return item;
  }

  async markAllUploaded() {
    const reels = await this.listReels();
    let marked = 0;
    for (const reel of reels) {
      if (reel.uploaded) {
        continue;
      }
      await this.writeReelMeta(reel.id, {
        ...(await this.readReelMeta(reel.id)),
        uploaded: true,
        uploadedAt: new Date().toISOString(),
      });
      marked += 1;
    }
    return {
      total: reels.length,
      marked,
    };
  }

  /**
   * Process the queue with up to maxConcurrentJobs Python generator instances.
   * When a job finishes it automatically picks up the next queued job.
   */
  private processQueue(): void {
    while (this.runningCount < this.maxConcurrentJobs && this.queue.length > 0) {
      const jobId = this.queue.shift();
      if (!jobId) continue;

      const job = this.jobs.get(jobId);
      if (!job) {
        // Job was removed — try next
        continue;
      }

      this.runningCount += 1;
      this.logger.log(
        `Queue: starting job ${jobId} (${this.queue.length} queued, ${this.runningCount} running)`,
      );

      void this.runJob(job).finally(() => {
        this.runningCount -= 1;
        this.logger.log(
          `Queue: finished job ${jobId} (${this.queue.length} queued, ${this.runningCount} running)`,
        );
        this.processQueue();
      });
    }
  }

  /**
   * Returns WxH string for the generator script.
   * phone: 9:16 portrait; tablet: 4:3; laptop: 16:10; desktop: 16:9.
   * For phone, long scripts use a smaller size for faster render.
   */
  private getOutputDimensions(
    sizeKey: 'phone' | 'tablet' | 'laptop' | 'desktop',
    isLongScript: boolean,
  ): string {
    switch (sizeKey) {
      case 'tablet':
        return '1024x768';
      case 'laptop':
        return '1280x800';
      case 'desktop':
        return '1920x1080';
      case 'phone':
      default:
        return isLongScript ? '540x960' : '720x1280';
    }
  }

  private async runJob(job: ReelJob): Promise<void> {
    const startedAt = Date.now();
    this.updateJob(job.id, {
      status: 'processing',
      progress: 1,
      stage: 'Preparing assets',
      updatedAt: new Date().toISOString(),
      error: undefined,
    });
    this.logger.verbose(`Starting job ${job.id}`);

    const scriptPath = join(paths.scriptsDir, `api-script-${job.id}.txt`);
    await writeFile(scriptPath, `${job.script.trim()}\n`, 'utf8');

    const wordCount = job.script.trim().split(/\s+/).filter(Boolean).length;
    const isLongScript = wordCount >= 130;
    const sizeKey = job.outputSize ?? 'phone';
    const outputSize = this.getOutputDimensions(sizeKey, isLongScript);
    const outputFps = isLongScript ? 20 : 24;
    const voiceRate = isLongScript ? Math.max(job.voiceRate, 210) : job.voiceRate;
    const maxWordsPerChunk = isLongScript ? 14 : 8;
    if (isLongScript) {
      this.logger.verbose(
        `Job ${job.id} using long-script fast profile (words=${wordCount}, size=${outputSize}, fps=${outputFps}, chunk=${maxWordsPerChunk})`,
      );
    }

    const voiceArgs = await this.buildVoiceArgs(job, voiceRate);
    if (!voiceArgs) {
      return;
    }

    const bgMode = job.bgMode ?? 'auto';

    const args = [
      paths.generatorScript,
      '--script',
      scriptPath,
      '--size',
      outputSize,
      '--fps',
      String(outputFps),
      '--render-preset',
      'ultrafast',
      '--max-words-per-chunk',
      String(maxWordsPerChunk),
      ...voiceArgs,
    ];

    if (job.title) {
      args.push('--title', job.title);
    }

    if (bgMode === 'caption') {
      // Procedural animated background — no video assets needed
      args.push('--caption-bg');
    } else if (bgMode === 'clip' && job.clipName) {
      // Specific clip requested: check order-upload dir first (customer uploads), then catalog
      const orderClipPath = join(paths.orderClipsDir, job.clipName);
      const catalogClipPath = join(paths.clipsDir, job.clipName);
      const clipPath = (await this.fileExists(orderClipPath))
        ? orderClipPath
        : (await this.fileExists(catalogClipPath))
          ? catalogClipPath
          : null;
      if (!clipPath) {
        this.updateJob(job.id, {
          status: 'failed',
          updatedAt: new Date().toISOString(),
          error: `Selected clip not found: ${job.clipName}`,
        });
        return;
      }
      const clipDir = clipPath === orderClipPath ? paths.orderClipsDir : paths.clipsDir;
      args.push('--bg-dir', clipDir, '--bg-clip', clipPath);
    } else {
      // 'auto' — random clip from directory (or gradient if directory is empty)
      args.push('--bg-dir', paths.clipsDir);
    }

    let transcriptPath: string | null = null;
    if (job.useClipAudio) {
      args.push('--use-clip-audio');
      transcriptPath = join(paths.scriptsDir, `api-transcript-${job.id}.json`);
      await writeFile(
        transcriptPath,
        JSON.stringify({
          text: job.script,
          segments: job.transcriptSegments ?? [],
        }),
        'utf8',
      );
      args.push('--transcript-json', transcriptPath);
      if (!job.useClipAudioWithNarrator) {
        args.push('--no-narrate-title');
      }
      if (job.useClipAudioWithNarrator) {
        args.push('--clip-audio-plus-narrator');
      }
    }

    args.push('--font-name', job.fontName || 'default');
    this.logger.debug(`Running generator for job ${job.id}: ${args.join(' ')}`);
    if (this.pythonVerbose) {
      this.logger.debug(
        `Python exe: ${paths.pythonExe} | repoRoot: ${paths.repoRoot}`,
      );
    }

    if (!(await this.fileExists(paths.pythonExe))) {
      const error = `Python runtime not found at ${paths.pythonExe}`;
      this.updateJob(job.id, {
        status: 'failed',
        stage: 'Failed',
        updatedAt: new Date().toISOString(),
        error,
      });
      this.logger.error(`Job ${job.id} failed: ${error}`);
      return;
    }

    let stdout = '';
    let stderr = '';
    const result = await new Promise<{ code: number | null; timedOut: boolean }>(
      (resolve) => {
        const proc = spawn(paths.pythonExe, args, {
          cwd: paths.repoRoot,
          windowsHide: true,
        });
        let resolved = false;
        const timer = setTimeout(() => {
          if (resolved) {
            return;
          }
          resolved = true;
          proc.kill();
          resolve({ code: null, timedOut: true });
        }, this.jobTimeoutMs);

        proc.on('error', (err) => {
          if (resolved) {
            return;
          }
          resolved = true;
          clearTimeout(timer);
          stderr += String(err);
          resolve({ code: 1, timedOut: false });
        });
        proc.stdout.on('data', (chunk) => {
          const text = chunk.toString();
          stdout += text;
          this.updateProgressFromOutput(job.id, text);
          if (this.pythonVerbose) {
            this.logger.debug(`[python stdout] ${text.trim()}`);
          }
        });
        proc.stderr.on('data', (chunk) => {
          const text = chunk.toString();
          stderr += text;
          this.updateProgressFromOutput(job.id, text);
          if (this.pythonVerbose) {
            this.logger.warn(`[python stderr] ${text.trim()}`);
          }
        });
        proc.on('exit', (code) => {
          if (resolved) {
            return;
          }
          resolved = true;
          clearTimeout(timer);
          resolve({ code, timedOut: false });
        });
      },
    );

    if (result.timedOut) {
      this.updateJob(job.id, {
        status: 'failed',
        stage: 'Timed out',
        updatedAt: new Date().toISOString(),
        error: 'Generation timed out before completion',
      });
      this.logger.error(`Job ${job.id} timed out`);
      return;
    }

    if (result.code !== 0) {
      if (this.pythonVerbose) {
        this.logger.error(
          `Python failed (code=${result.code}) for job ${job.id}. stderr: ${stderr.trim()} stdout: ${stdout.trim()}`,
        );
      }
      this.updateJob(job.id, {
        status: 'failed',
        stage: 'Failed',
        updatedAt: new Date().toISOString(),
        error: stderr.trim() || stdout.trim() || 'Generator exited with error',
      });
      this.logger.error(`Job ${job.id} failed with exit code ${result.code}`);
      return;
    }

    const outputFolder =
      this.parseOutputFolder(stdout) ??
      (await this.findNewestOutputFolder(startedAt));

    const hasExpectedOutputs = await this.hasExpectedOutputs(outputFolder);
    const hasVideoOutput = await this.hasVideoOutput(outputFolder);
    this.updateJob(job.id, {
      status: 'completed',
      progress: 100,
      stage: 'Completed',
      updatedAt: new Date().toISOString(),
      outputFolder: outputFolder ?? undefined,
      error: hasExpectedOutputs
        ? undefined
        : 'Video generated, transcript files missing',
    });
    if (outputFolder) {
      const meta = await this.readReelMeta(outputFolder);
      await this.writeReelMeta(outputFolder, {
        ...meta,
        nicheId: job.nicheId ?? meta.nicheId,
        nicheLabel: job.nicheLabel ?? meta.nicheLabel,
        orderId: job.orderId ?? meta.orderId,
      });
    }
    // When video generation is complete, move order to ready_for_sending so processing is false
    if (job.orderId && hasVideoOutput) {
      await this.ordersService
        .markReadyForSending(job.orderId)
        .catch((err) => {
          this.logger.warn(
            `Failed to update order ${job.orderId} to ready_for_sending: ${String(err)}`,
          );
        });
    }
    this.logger.log(
      `Job ${job.id} completed (${outputFolder ?? 'unknown output folder'})`,
    );
  }

  private async buildVoiceArgs(
    job: ReelJob,
    voiceRate: number,
  ): Promise<string[] | null> {
    if (job.voiceEngine === 'none') {
      return ['--voice-engine', 'none'];
    }
    if (job.voiceEngine === 'edge') {
      const selectedEdgeVoice = job.voiceName || edgeNarratorPresets[0].id;
      return [
        '--voice-engine',
        'edge',
        '--voice-name',
        selectedEdgeVoice,
        '--edge-rate',
        '-5',
      ];
    }

    if (job.voiceEngine === 'pyttsx3') {
      const args = ['--voice-engine', 'pyttsx3', '--voice-rate', String(voiceRate)];
      if (job.voiceName) {
        args.push('--voice-name', job.voiceName);
      }
      return args;
    }

    // Only reach here if voiceEngine === 'piper'
    // Guard: if the voice name looks like an Edge TTS voice (contains Neural),
    // fall back to edge rather than failing with a confusing piper error.
    if (job.voiceName && job.voiceName.includes('Neural')) {
      this.logger.warn(
        `Voice "${job.voiceName}" looks like an Edge TTS voice but engine is set to piper — falling back to edge.`,
      );
      return [
        '--voice-engine', 'edge',
        '--voice-name', job.voiceName,
        '--edge-rate', '-5',
      ];
    }

    const selectedVoiceId = job.voiceName || 'en_US-lessac-medium';
    const modelPath = join(
      paths.piperVoicesDir,
      selectedVoiceId,
      `${selectedVoiceId}.onnx`,
    );
    if (!(await this.fileExists(modelPath))) {
      this.updateJob(job.id, {
        status: 'failed',
        updatedAt: new Date().toISOString(),
        error: `Piper voice is not installed: ${selectedVoiceId}. Either install the voice or switch to Edge TTS engine.`,
      });
      return null;
    }

    return ['--voice-engine', 'piper', '--voice-name', modelPath];
  }

  private async listPyttsx3Voices(): Promise<LocalVoice[]> {
    if (!(await this.fileExists(paths.pythonExe))) {
      this.logger.warn(
        `pyttsx3 voice listing skipped; missing python at ${paths.pythonExe}`,
      );
      return [];
    }
    const command = [
      '-c',
      [
        'import json, pyttsx3',
        'engine = pyttsx3.init()',
        "voices = engine.getProperty('voices') or []",
        "result = [{'id': str(getattr(v, 'id', '')), 'name': str(getattr(v, 'name', ''))} for v in voices]",
        'print(json.dumps(result))',
      ].join('; '),
    ];

    let stdout = '';
    const result = await new Promise<{ code: number | null }>((resolve) => {
      const proc = spawn(paths.pythonExe, command, {
        cwd: paths.repoRoot,
        windowsHide: true,
      });
      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      proc.on('error', (err) => {
        this.logger.warn(`pyttsx3 voice listing failed: ${String(err)}`);
        resolve({ code: 1 });
      });
      proc.on('exit', (code) => resolve({ code }));
    });

    if (result.code !== 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(stdout) as LocalVoice[];
      return parsed.filter((voice) => voice.id || voice.name);
    } catch {
      return [];
    }
  }

  private async listInstalledPiperVoices() {
    await mkdir(paths.piperVoicesDir, { recursive: true });
    const installed = [];
    for (const voice of piperVoiceCatalog) {
      const modelPath = join(paths.piperVoicesDir, voice.id, `${voice.id}.onnx`);
      if (await this.fileExists(modelPath)) {
        installed.push({
          id: voice.id,
          name: voice.name,
          modelPath,
        });
      }
    }
    return installed;
  }

  private async downloadFileIfMissing(
    sourceUrl: string,
    destinationPath: string,
  ): Promise<void> {
    if (await this.fileExists(destinationPath)) {
      return;
    }

    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new BadRequestException(
        `Failed to download voice file from ${sourceUrl}`,
      );
    }

    const bytes = await response.arrayBuffer();
    await writeFile(destinationPath, Buffer.from(bytes));
  }

  private updateProgressFromOutput(jobId: string, outputChunk: string): void {
    const lower = outputChunk.toLowerCase();
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'processing') {
      return;
    }

    // Generator emits [REEL] <stage> so we can show progress before MoviePy logs (e.g. TTS, loading).
    const reelStageMatch = outputChunk.match(/\[REEL\]\s*(.+)/);
    if (reelStageMatch?.[1]) {
      const stage = reelStageMatch[1].trim();
      const progressByStage: Record<string, number> = {
        'Generating voiceover': 2,
        'Preparing timeline': 4,
        'Loading background': 5,
      };
      const progress = progressByStage[stage] ?? job.progress;
      this.updateJob(jobId, {
        progress: Math.max(job.progress, progress),
        stage,
        updatedAt: new Date().toISOString(),
      });
    }

    // Keep high percentages for true finalization so 90% doesn't linger.
    if (lower.includes('moviepy - building video')) {
      this.updateJob(jobId, {
        progress: Math.max(job.progress, 6),
        stage: 'Preparing timeline',
        updatedAt: new Date().toISOString(),
      });
    }
    if (lower.includes('moviepy - writing video')) {
      this.updateJob(jobId, {
        progress: Math.max(job.progress, 12),
        stage: 'Rendering frames',
        updatedAt: new Date().toISOString(),
      });
    }
    if (lower.includes('moviepy - done')) {
      this.updateJob(jobId, {
        progress: Math.max(job.progress, 95),
        stage: 'Finalizing output',
        updatedAt: new Date().toISOString(),
      });
    }
    if (lower.includes('moviepy - video ready')) {
      this.updateJob(jobId, {
        progress: Math.max(job.progress, 99),
        stage: 'Wrapping up',
        updatedAt: new Date().toISOString(),
      });
    }

    const matches = outputChunk.matchAll(/(\d{1,3})(?:\.\d+)?%/g);
    let lastPercent: number | null = null;
    for (const match of matches) {
      if (match[1]) {
        lastPercent = Number(match[1]);
      }
    }

    if (lastPercent === null || Number.isNaN(lastPercent)) {
      return;
    }

    // Map frame progress into 12-94 range for smoother perceived progress.
    const mappedProgress = Math.floor((lastPercent / 100) * 82) + 12;
    const nextProgress = Math.max(0, Math.min(94, mappedProgress));
    const latestJob = this.jobs.get(jobId);
    if (!latestJob || nextProgress <= latestJob.progress) {
      return;
    }

    this.updateJob(jobId, {
      progress: nextProgress,
      stage: 'Rendering frames',
      updatedAt: new Date().toISOString(),
    });
  }

  private parseOutputFolder(stdout: string): string | null {
    const match = stdout.match(/Output folder\s*:\s*(.+)/i);
    if (!match?.[1]) {
      return null;
    }

    const absolute = match[1].trim();
    return absolute.replace(/\\/g, '/').split('/').pop() ?? null;
  }

  private async findNewestOutputFolder(startedAt: number): Promise<string | null> {
    const entries = await readdir(paths.outputDir, { withFileTypes: true });
    const folders = entries.filter((entry) => entry.isDirectory());
    const candidates: { name: string; created: number }[] = [];

    for (const folder of folders) {
      const folderPath = join(paths.outputDir, folder.name);
      const folderStat = await stat(folderPath);
      const created = folderStat.birthtimeMs;
      if (created >= startedAt - 5000) {
        candidates.push({ name: folder.name, created });
      }
    }

    if (!candidates.length) {
      return null;
    }
    candidates.sort((a, b) => b.created - a.created);
    return candidates[0]?.name ?? null;
  }

  private async hasExpectedOutputs(outputFolder: string | null): Promise<boolean> {
    if (!outputFolder) {
      return false;
    }

    const folderPath = join(paths.outputDir, outputFolder);
    const expected = ['reel.mp4', 'reel.srt', 'reel.txt'];
    try {
      await Promise.all(expected.map((name) => access(join(folderPath, name))));
      return true;
    } catch {
      return false;
    }
  }

  private async hasVideoOutput(outputFolder: string | null): Promise<boolean> {
    if (!outputFolder) {
      return false;
    }

    const folderPath = join(paths.outputDir, outputFolder);
    try {
      await access(join(folderPath, 'reel.mp4'));
      return true;
    } catch {
      return false;
    }
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  private getReelMetaPath(reelId: string): string {
    return join(paths.outputDir, reelId, 'reel.meta.json');
  }

  private async readReelMeta(reelId: string): Promise<ReelMeta> {
    const metaPath = this.getReelMetaPath(reelId);
    if (!(await this.fileExists(metaPath))) {
      return {};
    }
    try {
      const raw = await readFile(metaPath, 'utf8');
      const parsed = JSON.parse(raw) as ReelMeta;
      return parsed ?? {};
    } catch {
      return {};
    }
  }

  private async writeReelMeta(reelId: string, meta: ReelMeta): Promise<void> {
    const metaPath = this.getReelMetaPath(reelId);
    await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  }

  private async persistJobToDb(job: ReelJob): Promise<void> {
    const entity = this.jobToEntity(job);
    await this.reelJobRepo.save(entity);
  }

  private jobToEntity(job: ReelJob): ReelJobEntity {
    const e = new ReelJobEntity();
    e.id = job.id;
    e.script = job.script;
    e.title = job.title ?? null;
    e.clip_name = job.clipName ?? null;
    e.font_name = job.fontName ?? null;
    e.voice_engine = job.voiceEngine;
    e.voice_name = job.voiceName ?? null;
    e.voice_rate = job.voiceRate ?? 180;
    e.bg_mode = job.bgMode ?? 'auto';
    e.status = job.status as ReelJobEntity['status'];
    e.progress = job.progress ?? 0;
    e.stage = job.stage ?? null;
    e.created_at = new Date(job.createdAt);
    e.updated_at = new Date(job.updatedAt);
    e.output_folder = job.outputFolder ?? null;
    e.error = job.error ?? null;
    e.order_id = job.orderId ?? null;
    e.output_size = job.outputSize ?? null;
    e.use_clip_audio = job.useClipAudio ?? false;
    e.use_clip_audio_with_narrator = job.useClipAudioWithNarrator ?? false;
    e.transcript_segments = job.transcriptSegments ?? null;
    e.niche_id = job.nicheId ?? null;
    e.niche_label = job.nicheLabel ?? null;
    return e;
  }

  private entityToJob(entity: ReelJobEntity): ReelJob {
    return {
      id: entity.id,
      script: entity.script,
      title: entity.title ?? undefined,
      clipName: entity.clip_name ?? undefined,
      fontName: entity.font_name ?? undefined,
      voiceEngine: entity.voice_engine as VoiceEngine,
      voiceName: entity.voice_name ?? undefined,
      voiceRate: entity.voice_rate ?? 180,
      bgMode: (entity.bg_mode as BgMode) ?? 'auto',
      status: entity.status,
      progress: entity.progress ?? 0,
      stage: entity.stage ?? undefined,
      createdAt: entity.created_at.toISOString(),
      updatedAt: entity.updated_at.toISOString(),
      outputFolder: entity.output_folder ?? undefined,
      error: entity.error ?? undefined,
      orderId: entity.order_id ?? undefined,
      outputSize: (entity.output_size as ReelJob['outputSize']) ?? undefined,
      useClipAudio: entity.use_clip_audio ?? undefined,
      useClipAudioWithNarrator: entity.use_clip_audio_with_narrator ?? undefined,
      transcriptSegments: entity.transcript_segments ?? undefined,
      nicheId: entity.niche_id ?? undefined,
      nicheLabel: entity.niche_label ?? undefined,
    };
  }

  private updateJob(jobId: string, patch: Partial<ReelJob>): void {
    const existing = this.jobs.get(jobId);
    if (!existing) {
      return;
    }
    this.jobs.set(jobId, { ...existing, ...patch });
  }

  private async ensureDirectories(): Promise<void> {
    await mkdir(paths.clipsDir, { recursive: true });
    await mkdir(paths.fontsDir, { recursive: true });
    await mkdir(paths.outputDir, { recursive: true });
    await mkdir(paths.scriptsDir, { recursive: true });
    await mkdir(paths.piperVoicesDir, { recursive: true });
  }

  /** Worker (offline): list jobs with status=queued from DB for local processing. */
  async listQueuedJobsForWorker(): Promise<ReelJob[]> {
    const rows = await this.reelJobRepo.find({
      where: { status: 'queued' },
      order: { created_at: 'ASC' },
    });
    return rows.map((e) => this.entityToJob(e));
  }

  /** Worker: claim a job (set status=processing) so only one worker processes it. */
  async claimJobForWorker(jobId: string): Promise<ReelJob> {
    const entity = await this.reelJobRepo.findOne({ where: { id: jobId } });
    if (!entity) throw new NotFoundException('Job not found');
    if (entity.status !== 'queued') {
      throw new BadRequestException(`Job ${jobId} is not queued (status=${entity.status})`);
    }
    entity.status = 'processing';
    entity.updated_at = new Date();
    await this.reelJobRepo.save(entity);
    const job = this.entityToJob(entity);
    this.jobs.set(jobId, job);
    return job;
  }

  /** Worker: update job status/progress (e.g. completed, failed) and optionally output_folder. */
  async updateJobFromWorker(
    jobId: string,
    patch: {
      status?: ReelJob['status'];
      progress?: number;
      stage?: string;
      outputFolder?: string;
      error?: string;
    },
  ): Promise<ReelJob> {
    const entity = await this.reelJobRepo.findOne({ where: { id: jobId } });
    if (!entity) throw new NotFoundException('Job not found');
    if (patch.status != null) entity.status = patch.status as ReelJobEntity['status'];
    if (patch.progress != null) entity.progress = patch.progress;
    if (patch.stage != null) entity.stage = patch.stage;
    if (patch.outputFolder != null) entity.output_folder = patch.outputFolder;
    if (patch.error != null) entity.error = patch.error;
    entity.updated_at = new Date();
    await this.reelJobRepo.save(entity);
    const job = this.entityToJob(entity);
    this.jobs.set(jobId, job);
    return job;
  }

  /**
   * Worker: save uploaded reel output files to VPS and mark job completed.
   * Creates output/<outputFolderName>/ with reel.mp4, reel.srt, reel.txt, optional reel-audio.wav.
   */
  async saveReelOutputFromWorker(
    jobId: string,
    outputFolderName: string,
    files: {
      video: Buffer;
      srt: Buffer;
      txt: Buffer;
      audio?: Buffer;
    },
  ): Promise<ReelItem> {
    const entity = await this.reelJobRepo.findOne({ where: { id: jobId } });
    if (!entity) throw new NotFoundException('Job not found');
    await this.ensureDirectories();
    const folderPath = join(paths.outputDir, outputFolderName);
    await mkdir(folderPath, { recursive: true });
    await writeFile(join(folderPath, 'reel.mp4'), files.video);
    await writeFile(join(folderPath, 'reel.srt'), files.srt);
    await writeFile(join(folderPath, 'reel.txt'), files.txt);
    if (files.audio?.length) {
      await writeFile(join(folderPath, 'reel-audio.wav'), files.audio);
    }
    const meta: ReelMeta = {
      orderId: entity.order_id ?? undefined,
      nicheId: entity.niche_id ?? undefined,
      nicheLabel: entity.niche_label ?? undefined,
    };
    await this.writeReelMeta(outputFolderName, meta);
    entity.status = 'completed';
    entity.progress = 100;
    entity.stage = 'Completed';
    entity.output_folder = outputFolderName;
    entity.error = null;
    entity.updated_at = new Date();
    await this.reelJobRepo.save(entity);
    const job = this.entityToJob(entity);
    this.jobs.set(jobId, job);
    if (entity.order_id) {
      await this.ordersService.markReadyForSending(entity.order_id).catch((err) => {
        this.logger.warn(`Failed to mark order ${entity.order_id} ready_for_sending: ${String(err)}`);
      });
    }
    const reels = await this.listReels();
    const item = reels.find((r) => r.id === outputFolderName);
    if (!item) throw new NotFoundException('Reel output not found after save');
    return item;
  }

  /**
   * Delete all reel output folders that have an orderId in their meta.
   * Returns the number of folders deleted.
   */
  async deleteAllOrderReels(): Promise<number> {
    await this.ensureDirectories();
    const entries = await readdir(paths.outputDir, { withFileTypes: true });
    const folders = entries.filter((e) => e.isDirectory());
    let deleted = 0;
    for (const folder of folders) {
      const meta = await this.readReelMeta(folder.name);
      if (!meta.orderId) continue;
      const folderPath = join(paths.outputDir, folder.name);
      try {
        await rm(folderPath, { recursive: true, force: true });
        deleted += 1;
      } catch {
        this.logger.warn(`Failed to delete order reel folder: ${folder.name}`);
      }
    }
    return deleted;
  }
}
