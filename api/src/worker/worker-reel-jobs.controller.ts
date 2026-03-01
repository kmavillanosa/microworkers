import {
	BadRequestException,
	Body,
	Controller,
	Get,
	Param,
	Patch,
	Post,
	Query,
	Req,
	UnauthorizedException,
	UseInterceptors,
} from '@nestjs/common'
import { FileFieldsInterceptor } from '@nestjs/platform-express'
import type { Request } from 'express'
import { ReelsService } from '../reels/reels.service'

const WORKER_SECRET_HEADER = 'x-worker-secret'

function checkWorkerSecret(req: Request): void {
	const secret = process.env.WORKER_SECRET
	if (!secret) return
	const provided = req.header(WORKER_SECRET_HEADER)
	if (provided !== secret) {
		throw new UnauthorizedException('Invalid or missing worker secret')
	}
}

@Controller('api/worker/reel-jobs')
export class WorkerReelJobsController {
	constructor(private readonly reelsService: ReelsService) {}

	@Get()
	async listQueued(@Query('status') status: string, @Req() req: Request) {
		checkWorkerSecret(req)
		if (status !== 'queued') {
			throw new BadRequestException('Only status=queued is supported')
		}
		return this.reelsService.listQueuedJobsForWorker()
	}

	@Post(':id/claim')
	async claim(@Param('id') id: string, @Req() req: Request) {
		checkWorkerSecret(req)
		return this.reelsService.claimJobForWorker(id)
	}

	@Patch(':id')
	async update(
		@Param('id') id: string,
		@Body()
		body: {
			status?: 'queued' | 'processing' | 'completed' | 'failed'
			progress?: number
			stage?: string
			outputFolder?: string
			error?: string
		},
		@Req() req: Request,
	) {
		checkWorkerSecret(req)
		return this.reelsService.updateJobFromWorker(id, body)
	}

	@Post(':id/upload')
	@UseInterceptors(
		FileFieldsInterceptor([
			{ name: 'video', maxCount: 1 },
			{ name: 'srt', maxCount: 1 },
			{ name: 'txt', maxCount: 1 },
			{ name: 'audio', maxCount: 1 },
		]),
	)
	async upload(@Param('id') id: string, @Req() req: Request) {
		checkWorkerSecret(req)
		const body = req.body as { outputFolder?: string }
		const outputFolder = body?.outputFolder
		if (!outputFolder || typeof outputFolder !== 'string' || !outputFolder.trim()) {
			throw new BadRequestException('outputFolder is required in form body')
		}
		const files = req.files as {
			video?: Express.Multer.File[]
			srt?: Express.Multer.File[]
			txt?: Express.Multer.File[]
			audio?: Express.Multer.File[]
		} | undefined
		const video = files?.video?.[0]
		const srt = files?.srt?.[0]
		const txt = files?.txt?.[0]
		const audio = files?.audio?.[0]
		if (!video?.buffer || !srt?.buffer || !txt?.buffer) {
			throw new BadRequestException('video, srt, and txt files are required')
		}
		const result = await this.reelsService.saveReelOutputFromWorker(id, outputFolder.trim(), {
			video: video.buffer,
			srt: srt.buffer,
			txt: txt.buffer,
			audio: audio?.buffer,
		})
		return { ok: true, reel: result }
	}
}
