import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { CreateOrderDto } from './dto/create-order.dto'
import type { UpdateOrderPricingDto } from './dto/update-order-pricing.dto'
import type { UpdateOrderDto } from './dto/update-order.dto'
import { OrderEntity } from './order.entity'
import { OrderPricingEntity } from './order-pricing.entity'

export type OrderStatus = 'pending' | 'accepted' | 'declined' | 'processing' | 'ready_for_sending' | 'closed'

export interface OrderPricing {
	wordsPerFrame: number
	pricePerFramePesos: number
}

export interface Order {
	id: string
	customerName: string
	customerEmail: string
	deliveryAddress: string
	script: string
	title: string | null
	fontId: string
	clipName: string | null
	voiceEngine: string
	voiceName: string
	/** Output video size: phone, tablet, laptop, desktop. */
	outputSize: string | null
	useClipAudio?: boolean
	useClipAudioWithNarrator?: boolean
	bankCode: string | null
	paymentReference: string | null
	/** PayMongo statement_descriptor or other transaction descriptor. */
	paymentDescriptor: string | null
	paymentStatus: 'pending' | 'confirmed'
	orderStatus: OrderStatus
	createdAt: string
}

@Injectable()
export class OrdersService {
	constructor(
		@InjectRepository(OrderEntity)
		private readonly ordersRepo: Repository<OrderEntity>,
		@InjectRepository(OrderPricingEntity)
		private readonly pricingRepo: Repository<OrderPricingEntity>,
	) {}

	async create(dto: CreateOrderDto): Promise<Order> {
		const id = randomUUID()
		const entity = this.ordersRepo.create({
			id,
			customer_name: dto.customerName?.trim() ?? '',
			customer_email: dto.customerEmail?.trim() ?? '',
			delivery_address: dto.deliveryAddress?.trim() ?? '',
			script: dto.script ?? '',
			title: dto.title ?? null,
			font_id: dto.fontId,
			clip_name: dto.clipName ?? null,
			voice_engine: dto.voiceEngine,
			voice_name: dto.voiceName,
			output_size: ['phone', 'tablet', 'laptop', 'desktop'].includes(dto.outputSize ?? '') ? dto.outputSize! : 'phone',
			use_clip_audio: dto.useClipAudio ?? false,
			use_clip_audio_with_narrator: dto.useClipAudioWithNarrator ?? false,
			payment_status: 'pending',
			order_status: 'pending',
		})
		await this.ordersRepo.save(entity)
		return this.mapEntity(entity)
	}

	async list(): Promise<Order[]> {
		const rows = await this.ordersRepo.find({
			order: { created_at: 'DESC' },
		})
		return rows.map((row) => this.mapEntity(row))
	}

	async getById(id: string): Promise<Order> {
		const row = await this.ordersRepo.findOne({ where: { id } })
		if (!row) throw new NotFoundException(`Order "${id}" not found`)
		return this.mapEntity(row)
	}

	/** Delete all orders from the database. Returns the number of orders deleted. */
	async deleteAllOrders(): Promise<number> {
		const result = await this.ordersRepo
			.createQueryBuilder()
			.delete()
			.from(OrderEntity)
			.execute()
		return result.affected ?? 0
	}

	async confirmPayment(id: string, bankCode: string, paymentReference: string): Promise<Order> {
		const order = await this.ordersRepo.findOne({ where: { id } })
		if (!order) throw new NotFoundException(`Order "${id}" not found`)
		order.bank_code = bankCode
		order.payment_reference = paymentReference
		order.payment_status = 'confirmed'
		await this.ordersRepo.save(order)
		return this.mapEntity(order)
	}

	/** Mark order as paid when PayMongo webhook receives checkout_session.payment.paid. Stores transaction ref, optional descriptor, and payer info for receipt and backoffice. */
	async confirmPaymentByPayMongo(
		orderId: string,
		paymongoTransactionRef?: string,
		opts?: {
			paymentDescriptor?: string
			payer?: { customerName?: string; customerEmail?: string; deliveryAddress?: string }
		},
	): Promise<Order> {
		const order = await this.ordersRepo.findOne({ where: { id: orderId } })
		if (!order) throw new NotFoundException(`Order "${orderId}" not found`)
		order.bank_code = 'paymongo'
		order.payment_reference = paymongoTransactionRef ?? 'paymongo'
		order.payment_descriptor = opts?.paymentDescriptor?.trim() ?? null
		order.payment_status = 'confirmed'
		const payer = opts?.payer
		if (payer?.customerName?.trim()) order.customer_name = payer.customerName.trim()
		if (payer?.customerEmail?.trim()) order.customer_email = payer.customerEmail.trim()
		if (payer?.deliveryAddress !== undefined) order.delivery_address = payer.deliveryAddress?.trim() ?? ''
		await this.ordersRepo.save(order)
		return this.mapEntity(order)
	}

	async updateStatus(id: string, orderStatus: OrderStatus): Promise<Order> {
		const entity = await this.ordersRepo.findOne({ where: { id } })
		if (!entity) throw new NotFoundException(`Order "${id}" not found`)
		const allowed: OrderStatus[] = ['pending', 'accepted', 'declined', 'processing', 'ready_for_sending', 'closed']
		if (!allowed.includes(orderStatus)) {
			throw new BadRequestException(`Invalid order status: ${orderStatus}`)
		}
		entity.order_status = orderStatus
		await this.ordersRepo.save(entity)
		return this.mapEntity(entity)
	}

	async updateScript(id: string, script: string): Promise<void> {
		await this.ordersRepo.update({ id }, { script })
	}

	/** Partial update (e.g. script revision or clip-audio options before checkout). Only provided fields are updated. */
	async update(id: string, dto: UpdateOrderDto): Promise<Order> {
		const entity = await this.ordersRepo.findOne({ where: { id } })
		if (!entity) throw new NotFoundException(`Order "${id}" not found`)
		if (dto.customerName !== undefined) entity.customer_name = dto.customerName.trim()
		if (dto.customerEmail !== undefined) entity.customer_email = dto.customerEmail.trim()
		if (dto.deliveryAddress !== undefined) entity.delivery_address = dto.deliveryAddress.trim()
		if (dto.script !== undefined) entity.script = dto.script
		if (dto.title !== undefined) entity.title = dto.title
		if (dto.outputSize !== undefined) entity.output_size = dto.outputSize
		if (dto.useClipAudio !== undefined) entity.use_clip_audio = dto.useClipAudio
		if (dto.useClipAudioWithNarrator !== undefined) entity.use_clip_audio_with_narrator = dto.useClipAudioWithNarrator
		await this.ordersRepo.save(entity)
		return this.mapEntity(entity)
	}

	/**
	 * Fill script from transcript only for orders that don't have a script yet.
	 * Never overwrite an existing script so user revisions (web-orders or backoffice) are preserved.
	 */
	async applyTranscriptToClipOrders(clipName: string, transcript: string): Promise<void> {
		const trimmed = transcript.trim()
		if (!trimmed) return
		await this.ordersRepo
			.createQueryBuilder()
			.update(OrderEntity)
			.set({ script: trimmed })
			.where('clip_name = :clipName', { clipName })
			.andWhere('order_status NOT IN (:...statuses)', {
				statuses: ['declined', 'closed'],
			})
			.andWhere('(script IS NULL OR TRIM(script) = :empty)', { empty: '' })
			.execute()
	}

	async markReadyForSending(id: string): Promise<void> {
		const entity = await this.ordersRepo.findOne({ where: { id } })
		if (!entity) {
			return
		}
		if (entity.order_status === 'declined' || entity.order_status === 'closed') {
			return
		}
		entity.order_status = 'ready_for_sending'
		await this.ordersRepo.save(entity)
	}

	async getPricing(): Promise<OrderPricing> {
		let row = await this.pricingRepo.findOne({ where: { id: 'default' } })
		if (!row) {
			row = this.pricingRepo.create({
				id: 'default',
				words_per_frame: 5,
				price_per_frame_pesos: 5,
			})
			await this.pricingRepo.save(row)
		}
		return {
			wordsPerFrame: row.words_per_frame ?? 5,
			pricePerFramePesos: row.price_per_frame_pesos ?? 5,
		}
	}

	async updatePricing(dto: UpdateOrderPricingDto): Promise<OrderPricing> {
		const current = await this.getPricing()
		const wordsPerFrame = dto.wordsPerFrame ?? current.wordsPerFrame
		const pricePerFramePesos = dto.pricePerFramePesos ?? current.pricePerFramePesos
		if (wordsPerFrame < 1 || wordsPerFrame > 100) {
			throw new BadRequestException('wordsPerFrame must be between 1 and 100')
		}
		if (pricePerFramePesos < 0) {
			throw new BadRequestException('pricePerFramePesos must be non-negative')
		}
		let row = await this.pricingRepo.findOne({ where: { id: 'default' } })
		if (!row) {
			row = this.pricingRepo.create({
				id: 'default',
				words_per_frame: wordsPerFrame,
				price_per_frame_pesos: pricePerFramePesos,
			})
		} else {
			row.words_per_frame = wordsPerFrame
			row.price_per_frame_pesos = pricePerFramePesos
		}
		await this.pricingRepo.save(row)
		return {
			wordsPerFrame,
			pricePerFramePesos,
		}
	}

	private mapEntity(row: OrderEntity): Order {
		return {
			id: row.id,
			customerName: row.customer_name,
			customerEmail: row.customer_email,
			deliveryAddress: row.delivery_address,
			script: row.script,
			title: row.title,
			fontId: row.font_id,
			clipName: row.clip_name,
			voiceEngine: row.voice_engine,
			voiceName: row.voice_name,
			outputSize: row.output_size ?? 'phone',
			useClipAudio: row.use_clip_audio ?? false,
			useClipAudioWithNarrator: row.use_clip_audio_with_narrator ?? false,
			bankCode: row.bank_code,
			paymentReference: row.payment_reference,
			paymentDescriptor: row.payment_descriptor ?? null,
			paymentStatus: row.payment_status,
			orderStatus: (row.order_status ?? 'pending') as OrderStatus,
			createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
		}
	}
}
