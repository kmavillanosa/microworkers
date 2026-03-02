import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	Logger,
	NotFoundException,
	Param,
	Patch,
	Post,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Request } from 'express'
import type { FileFilterCallback } from 'multer'
import { mkdir } from 'node:fs/promises'
import { paths } from '../paths'
import { ClipsService } from '../clips/clips.service'
import { OrdersService, type OrderStatus } from './orders.service'
import { ReelsService } from '../reels/reels.service'
import { ConfirmPaymentDto } from './dto/confirm-payment.dto'
import { CreateOrderDto } from './dto/create-order.dto'
import { PaymongoCheckoutDto } from './dto/paymongo-checkout.dto'
import { PaymongoQrDto } from './dto/paymongo-qr.dto'
import { PrepareCheckoutDto } from './dto/prepare-checkout.dto'
import { PaymongoService } from '../paymongo/paymongo.service'
import { SettingsService } from '../settings/settings.service'
import { SetOrderStatusDto } from './dto/set-order-status.dto'
import { ProcessOrderDto } from './dto/process-order.dto'
import { UpdateOrderPricingDto } from './dto/update-order-pricing.dto'
import { UpdateOrderDto } from './dto/update-order.dto'
import { DeleteAllOrdersDto } from './dto/delete-all-orders.dto'

const allowedExt = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi'])
const DELETE_ALL_CONFIRM = 'DELETE_ALL_ORDERS'

type Segment = { start: number; end: number; text: string }

/**
 * Align revised script to original segment timings so captions stay in sync with clip audio.
 * Splits the revised script proportionally by each segment's share of the original word count,
 * keeping original start/end times.
 */
function alignScriptToSegmentTiming(
	script: string,
	segments: Segment[],
): Segment[] {
	const scriptWords = script.trim().split(/\s+/).filter(Boolean)
	if (scriptWords.length === 0) return segments
	const segWordCounts = segments.map((s) =>
		s.text.trim().split(/\s+/).filter(Boolean).length,
	)
	const totalOrig = segWordCounts.reduce((a, b) => a + b, 0)
	if (totalOrig === 0) return segments
	let wordIdx = 0
	return segments.map((seg, i) => {
		const n = segWordCounts[i]
		const proportion = n / totalOrig
		const take = Math.max(
			0,
			Math.round(scriptWords.length * proportion),
		)
		const startIdx = wordIdx
		const endIdx = i === segments.length - 1
			? scriptWords.length
			: Math.min(wordIdx + take, scriptWords.length)
		wordIdx = endIdx
		const text = scriptWords.slice(startIdx, endIdx).join(' ').trim()
		return { start: seg.start, end: seg.end, text: text || seg.text }
	})
}

@Controller('api/orders')
export class OrdersController {
	private readonly logger = new Logger(OrdersController.name)

	constructor(
		private readonly ordersService: OrdersService,
		private readonly reelsService: ReelsService,
		private readonly clipsService: ClipsService,
		private readonly paymongoService: PaymongoService,
		private readonly settingsService: SettingsService,
	) {}

	@Post('upload-clip')
	@UseInterceptors(
		FileInterceptor('file', {
			storage: diskStorage({
				destination: async (
					_req: Request,
					_file: Express.Multer.File,
					cb: (error: Error | null, destination: string) => void,
				) => {
					try {
						await mkdir(paths.orderClipsDir, { recursive: true })
						cb(null, paths.orderClipsDir)
					} catch (err) {
						cb(err as Error, paths.orderClipsDir)
					}
				},
				filename: (
					_req: Request,
					file: Express.Multer.File,
					cb: (error: Error | null, filename: string) => void,
				) => {
					const ext = extname(file.originalname).toLowerCase()
					cb(null, `order-${Date.now()}-${randomUUID()}${allowedExt.has(ext) ? ext : '.mp4'}`)
				},
			}),
			fileFilter: (
				_req: Request,
				file: Express.Multer.File,
				cb: FileFilterCallback,
			) => {
				const ext = extname(file.originalname).toLowerCase()
				if (!allowedExt.has(ext)) {
					cb(null, false)
					return
				}
				cb(null, true)
			},
		}),
	)
	async uploadClip(@UploadedFile() file: Express.Multer.File) {
		if (!file) throw new BadRequestException('No file uploaded')
		await this.clipsService.registerFromDisk('order', file.filename)
		if (process.env.RUN_TRANSCRIPTION_IN_API !== 'false') {
			void this.clipsService.transcribeClip('order', file.filename)
		}
		return {
			name: file.filename,
			url: `/media/order-clips/${file.filename}`,
		}
	}

	@Post()
	async create(@Body() body: CreateOrderDto) {
		const script = body.script?.trim() ?? ''
		const clipName = body.clipName?.trim()
		if (!script && !clipName) {
			throw new BadRequestException('Script is required when no clip is uploaded')
		}
		let resolvedScript = script
		if (clipName) {
			const transcript = await this.clipsService.getTranscript('order', clipName)
			if (transcript) {
				resolvedScript = transcript
			}
		}
		return this.ordersService.create({
			...body,
			script: resolvedScript,
		})
	}

	@Post('delete-all')
	async deleteAllOrdersAndRelated(@Body() body: DeleteAllOrdersDto) {
		if (body.confirm !== DELETE_ALL_CONFIRM) {
			throw new BadRequestException('Missing or invalid confirm value')
		}
		const [ordersDeleted, orderReelsDeleted, orderClipsDeleted] = await Promise.all([
			this.ordersService.deleteAllOrders(),
			this.reelsService.deleteAllOrderReels(),
			this.clipsService.deleteAllOrderClips(),
		])
		return {
			ordersDeleted,
			orderReelsDeleted,
			orderClipsDeleted,
		}
	}

	@Post(':id/process')
	async processOrder(@Param('id') id: string, @Body() body: ProcessOrderDto) {
		const order = await this.ordersService.getById(id)
		let script = body.script?.trim() ?? order.script?.trim() ?? ''
		let segments: Array<{ start: number; end: number; text: string }> | null = null
		const useClipAudio = body.useClipAudio ?? order.useClipAudio ?? Boolean(order.clipName)
		const useClipAudioWithNarrator = body.useClipAudioWithNarrator ?? order.useClipAudioWithNarrator ?? false
		const scriptOverridden = Boolean(body.script?.trim())
		if (order.clipName) {
			const transcriptData = await this.clipsService.getTranscriptData('order', order.clipName)
			const transcript = transcriptData.text
			segments = transcriptData.segments
			if (useClipAudio || useClipAudioWithNarrator) {
				const hasClipTranscript = transcript && segments?.length
				if (scriptOverridden) {
					await this.ordersService.updateScript(order.id, script)
					// For clip+narrator, caption timing comes from TTS so drop segments. For clip-only, keep timing by aligning revised script to segments.
					if (useClipAudioWithNarrator) segments = null
					else if (segments?.length && script !== transcript)
						segments = alignScriptToSegmentTiming(script, segments)
				} else if (useClipAudioWithNarrator && script && !hasClipTranscript) {
					segments = null
				} else if (!hasClipTranscript && !script) {
					throw new BadRequestException('Transcript not ready yet for this clip')
				} else if (hasClipTranscript) {
					if (!script) {
						script = transcript
						await this.ordersService.updateScript(order.id, transcript)
					} else if (script !== transcript) {
						// Script was edited: for clip-only, align revised script to segment timings so captions stay in sync with clip audio; for clip+narrator, use TTS timing.
						if (useClipAudioWithNarrator) segments = null
						else if (segments?.length)
							segments = alignScriptToSegmentTiming(script, segments)
					}
				}
			} else if (!script && transcript) {
				script = transcript
				await this.ordersService.updateScript(order.id, transcript)
			}
		}
		if (!script) {
			throw new BadRequestException('Order script is empty')
		}
		const job = await this.reelsService.createJob({
			script,
			title: order.title ?? undefined,
			clipName: order.clipName ?? undefined,
			fontName: order.fontId,
			voiceEngine: useClipAudio && !useClipAudioWithNarrator ? 'none' : (order.voiceEngine as any),
			voiceName: useClipAudio && !useClipAudioWithNarrator ? undefined : order.voiceName,
			...(useClipAudio && {
				useClipAudio: true,
				useClipAudioWithNarrator: useClipAudioWithNarrator || undefined,
				...(segments?.length ? { transcriptSegments: segments } : {}),
			}),
			orderId: order.id,
			outputSize: ['phone', 'tablet', 'laptop', 'desktop'].includes(order.outputSize ?? '')
				? (order.outputSize as 'phone' | 'tablet' | 'laptop' | 'desktop')
				: 'phone',
			scriptPosition: ['top', 'center', 'bottom'].includes(order.scriptPosition ?? '')
				? (order.scriptPosition as 'top' | 'center' | 'bottom')
				: undefined,
			scriptStyle: order.scriptStyle ?? undefined,
		})
		return {
			jobId: job.id,
			status: job.status,
			progress: job.progress,
			createdAt: job.createdAt,
		}
	}

	/** Debug: check if order or pending exists for a checkout session (no side effects). */
	@Get('debug-checkout-session/:sessionId')
	async debugCheckoutSession(@Param('sessionId') sessionId: string) {
		const sid = sessionId?.trim()
		if (!sid) {
			return { sessionId: null, orderExists: false, pendingExists: false, message: 'Empty session id' }
		}
		const order = await this.ordersService.findOrderByPaymentSessionId(sid)
		const pending = await this.ordersService.findPendingByCheckoutSessionId(sid)
		return {
			sessionId: sid,
			orderExists: Boolean(order?.id),
			orderId: order?.id ?? null,
			pendingExists: Boolean(pending && typeof pending === 'object'),
			message: order?.id
				? 'Order found'
				: pending
					? 'Pending found (order will be created when you call by-checkout-session)'
					: 'No order and no pending for this session',
		}
	}

	@Get('by-checkout-session/:sessionId')
	async getByCheckoutSession(@Param('sessionId') sessionId: string) {
		const sid = sessionId?.trim()
		if (!sid) {
			throw new BadRequestException('Checkout session ID is required')
		}
		let order = await this.ordersService.findOrderByPaymentSessionId(sid)
		if (!order) {
			order = await this.ordersService.createOrderFromPendingCheckout(sid)
		}
		if (!order) {
			this.logger.warn(`Order not found for checkout session: ${sid}`)
			throw new NotFoundException(
				'Order not found for this checkout session. If you used a payment link, please place your order from the order form and use "Continue to payment" so we can link your payment to your order.',
			)
		}
		return order
	}

	@Post('prepare-checkout')
	async prepareCheckout(@Body() body: PrepareCheckoutDto) {
		const payload = body.orderPayload as Record<string, unknown>
		const script = (payload.script as string)?.trim() ?? ''
		const clipName = (payload.clipName as string)?.trim()
		if (!script && !clipName) {
			throw new BadRequestException('Script is required when no clip is uploaded')
		}
		let resolvedPayload = { ...payload }
		if (clipName && !script) {
			const transcript = await this.clipsService.getTranscript('order', clipName)
			if (transcript) {
				resolvedPayload = { ...payload, script: transcript }
			}
		}
		const amountPesos = body.amountPesos
		const description = `Reel order · ₱${amountPesos}`
		const paymentMethodTypes = await this.settingsService.getPaymentMethodTypes()
		const customerName = (resolvedPayload.customerName as string)?.trim() ?? ''
		const customerEmail = (resolvedPayload.customerEmail as string)?.trim() ?? ''
		const deliveryAddress = (resolvedPayload.deliveryAddress as string)?.trim() ?? ''
		const billing =
			customerName || customerEmail || deliveryAddress
				? {
						...(customerName && { name: customerName }),
						...(customerEmail && { email: customerEmail }),
						...(deliveryAddress && { address: { line1: deliveryAddress } }),
					}
				: undefined
		const { checkoutUrl, sessionId } = await this.paymongoService.createCheckoutSession({
			amountPesos,
			description,
			successUrl: body.successUrl,
			cancelUrl: body.cancelUrl,
			billing,
			paymentMethodTypes,
		})
		if (!sessionId) {
			throw new BadRequestException('PayMongo did not return a session id')
		}
		// Persist pending checkout first so by-checkout-session can always find or create the order
		await this.ordersService.savePendingCheckout(sessionId, resolvedPayload)
		this.logger.log(`Saved pending checkout for session ${sessionId}`)
		// Create order now with payment_session_id so by-checkout-session finds it when user returns
		try {
			const dto = resolvedPayload as unknown as CreateOrderDto
			await this.ordersService.create(dto, sessionId)
			this.logger.log(`Created order for checkout session ${sessionId}`)
		} catch (err) {
			this.logger.warn(
				`Order create failed for session ${sessionId}, will create from pending on return: ${err instanceof Error ? err.message : String(err)}`,
			)
		}
		return { checkoutUrl, sessionId }
	}

	@Get()
	list() {
		return this.ordersService.list()
	}

	@Get('pricing')
	getPricing() {
		return this.ordersService.getPricing()
	}

	@Patch('pricing')
	updatePricing(@Body() body: UpdateOrderPricingDto) {
		return this.ordersService.updatePricing(body)
	}

	@Get(':id/reels')
	getReelsForOrder(@Param('id') id: string) {
		return this.reelsService.listReelsByOrderId(id)
	}

	@Get(':id')
	get(@Param('id') id: string) {
		return this.ordersService.getById(id)
	}

	@Delete(':id')
	async deleteOrderAndOutput(@Param('id') id: string) {
		const reelsDeleted = await this.reelsService.deleteReelsByOrderId(id)
		await this.ordersService.deleteOrder(id)
		return { orderDeleted: true, reelsDeleted }
	}

	@Patch(':id')
	update(@Param('id') id: string, @Body() body: UpdateOrderDto) {
		return this.ordersService.update(id, body)
	}

	@Patch(':id/payment')
	confirmPayment(@Param('id') id: string, @Body() body: ConfirmPaymentDto) {
		return this.ordersService.confirmPayment(id, body.bankCode, body.paymentReference)
	}

	@Post(':id/paymongo-checkout')
	async createPaymongoCheckout(
		@Param('id') id: string,
		@Body() body: PaymongoCheckoutDto,
	) {
		const order = await this.ordersService.getById(id)
		const amountPesos = body.amountPesos
		const description = `Reel order · ₱${amountPesos}`
		const paymentMethodTypes = await this.settingsService.getPaymentMethodTypes()
		const billing =
			order.customerName?.trim() || order.customerEmail?.trim() || order.deliveryAddress?.trim()
			? {
				...(order.customerName?.trim() && { name: order.customerName.trim() }),
				...(order.customerEmail?.trim() && { email: order.customerEmail.trim() }),
				...(order.deliveryAddress?.trim() && {
					address: { line1: order.deliveryAddress.trim() },
				}),
			}
			: undefined
		const { checkoutUrl } = await this.paymongoService.createCheckoutSession({
			orderId: id,
			amountPesos,
			description,
			successUrl: body.successUrl,
			cancelUrl: body.cancelUrl,
			billing,
			paymentMethodTypes,
		})
		return { checkoutUrl }
	}

	@Post(':id/paymongo-qr')
	async createPaymongoQr(
		@Param('id') id: string,
		@Body() body: PaymongoQrDto,
	) {
		const order = await this.ordersService.getById(id)
		const amountPesos = body.amountPesos
		const description = `Reel order · ₱${amountPesos}`
		const billing =
			order.customerName?.trim() || order.customerEmail?.trim()
				? {
					...(order.customerName?.trim() && { name: order.customerName.trim() }),
					...(order.customerEmail?.trim() && { email: order.customerEmail.trim() }),
				}
				: undefined
		const result = await this.paymongoService.createPaymentIntentQrPh({
			orderId: id,
			amountPesos,
			description,
			billing,
		})
		return {
			qrImageUrl: result.qrImageUrl,
			amountPesos: result.amountPesos,
			paymentIntentId: result.paymentIntentId,
		}
	}

	@Patch(':id/status')
	setStatus(@Param('id') id: string, @Body() body: SetOrderStatusDto) {
		return this.ordersService.updateStatus(id, body.orderStatus as OrderStatus)
	}
}
