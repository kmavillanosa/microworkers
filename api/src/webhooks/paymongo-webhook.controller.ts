import { Body, Controller, Post } from '@nestjs/common'
import type { CreateOrderDto } from '../orders/dto/create-order.dto'
import { OrdersService } from '../orders/orders.service'
import {
	PaymongoService,
	type CheckoutSessionResource,
} from '../paymongo/paymongo.service'

/** Payment resource (for payment.paid event). */
interface PaymongoPaymentData {
	id?: string
	type?: string
	attributes?: {
		payment_intent_id?: string
		external_reference_number?: string
		statement_descriptor?: string
		billing?: PaymongoBilling
	}
}

/** PayMongo webhook: for checkout_session.payment.paid, data is the checkout_session resource. */
interface PaymongoBilling {
	name?: string
	email?: string
	phone?: string
	address?: {
		line1?: string
		line2?: string
		city?: string
		state?: string
		postal_code?: string
		country?: string
	}
}

interface PaymongoEventPayload {
	data?: {
		attributes?: {
			type?: string
			data?: {
				id?: string
				type?: string
				attributes?: {
					metadata?: { order_id?: string }
					payment_intent_id?: string
					payments?: Array<{
						id?: string
						type?: string
						attributes?: {
							billing?: PaymongoBilling
							statement_descriptor?: string
							external_reference_number?: string
						}
					}>
					reference_number?: string
					billing?: PaymongoBilling
				}
			}
		}
	}
}

function formatBillingAddress(billing: PaymongoBilling): string {
	if (!billing?.address) return ''
	const a = billing.address
	const parts = [a.line1, a.line2, a.city, a.state, a.postal_code, a.country].filter(
		Boolean,
	)
	return parts.join(', ')
}

function extractFromSession(session: CheckoutSessionResource | null): {
	orderId: string | null
	transactionRef: string
	descriptor: string | null
	customerName: string
	customerEmail: string
	deliveryAddress: string
} {
	const attrs = session?.attributes
	const orderId = attrs?.metadata?.order_id ?? null
	const firstPayment = attrs?.payments?.[0]
	const billing =
		firstPayment?.attributes?.billing ?? attrs?.billing ?? undefined
	const customerName = billing?.name?.trim() ?? ''
	const customerEmail = billing?.email?.trim() ?? ''
	const deliveryAddress = billing ? formatBillingAddress(billing) : ''
	// Transaction reference: PayMongo reference_number (merchant-facing) or payment id
	const referenceNumber = attrs?.reference_number
	const paymentId = firstPayment?.id
	const transactionRef =
		referenceNumber ?? paymentId ?? session?.id ?? 'paymongo'
	const descriptor =
		firstPayment?.attributes?.statement_descriptor?.trim() ?? null
	return {
		orderId,
		transactionRef,
		descriptor,
		customerName,
		customerEmail,
		deliveryAddress,
	}
}

@Controller('api/webhooks')
export class PaymongoWebhookController {
	constructor(
		private readonly ordersService: OrdersService,
		private readonly paymongoService: PaymongoService,
	) {}

	@Post('paymongo')
	async handlePaymongo(@Body() payload: PaymongoEventPayload) {
		const eventType = payload?.data?.attributes?.type

		// QR Ph / Payment Intent: payment.paid
		if (eventType === 'payment.paid') {
			const paymentData = payload?.data?.attributes?.data as PaymongoPaymentData | undefined
			const paymentIntentId = paymentData?.attributes?.payment_intent_id
			if (!paymentIntentId) return { received: true }
			const paymentIntent = await this.paymongoService.getPaymentIntent(paymentIntentId)
			const orderId = paymentIntent?.attributes?.metadata?.order_id
			if (!orderId) return { received: true }
			const attrs = paymentData?.attributes
			const transactionRef =
				attrs?.external_reference_number ?? paymentData?.id ?? 'paymongo'
			const descriptor = attrs?.statement_descriptor?.trim() ?? null
			const billing = attrs?.billing
			const customerName = billing?.name?.trim() ?? ''
			const customerEmail = billing?.email?.trim() ?? ''
			const deliveryAddress = billing ? formatBillingAddress(billing) : ''
			try {
				await this.ordersService.confirmPaymentByPayMongo(orderId, transactionRef, {
					paymentDescriptor: descriptor ?? undefined,
					payer: {
						customerName: customerName || undefined,
						customerEmail: customerEmail || undefined,
						deliveryAddress: deliveryAddress || undefined,
					},
				})
			} catch {
				//
			}
			return { received: true }
		}

		if (eventType !== 'checkout_session.payment.paid') {
			return { received: true }
		}
		const checkoutSessionPayload = payload?.data?.attributes?.data
		const sessionId = checkoutSessionPayload?.id
		const orderIdFromPayload = checkoutSessionPayload?.attributes?.metadata?.order_id

		// Prefer full session from API so we get payments + billing (webhook may omit them)
		let session: CheckoutSessionResource | null = null
		if (sessionId) {
			session = await this.paymongoService.getCheckoutSession(sessionId)
		}
		if (!session) {
			session = checkoutSessionPayload as unknown as CheckoutSessionResource
		}

		const {
			orderId,
			transactionRef,
			descriptor,
			customerName,
			customerEmail,
			deliveryAddress,
		} = extractFromSession(session)

		let orderIdResolved = orderId ?? orderIdFromPayload

		// No existing order: create from pending (pay-first flow)
		if (!orderIdResolved && sessionId) {
			const payload = await this.ordersService.findPendingByCheckoutSessionId(sessionId)
			if (payload && typeof payload === 'object') {
				try {
					const dto = payload as unknown as CreateOrderDto
					const order = await this.ordersService.create(dto, sessionId)
					orderIdResolved = order.id
					await this.ordersService.confirmPaymentByPayMongo(orderIdResolved, transactionRef, {
						paymentDescriptor: descriptor ?? undefined,
						payer: {
							customerName: customerName || undefined,
							customerEmail: customerEmail || undefined,
							deliveryAddress: deliveryAddress || undefined,
						},
					})
					await this.ordersService.deletePendingCheckout(sessionId)
				} catch {
					// Log but respond 200 so PayMongo does not retry indefinitely
				}
				return { received: true }
			}
		}

		if (!orderIdResolved) {
			return { received: true }
		}

		try {
			await this.ordersService.confirmPaymentByPayMongo(
				orderIdResolved,
				transactionRef,
				{
					paymentDescriptor: descriptor ?? undefined,
					payer: {
						customerName: customerName || undefined,
						customerEmail: customerEmail || undefined,
						deliveryAddress: deliveryAddress || undefined,
					},
				},
			)
		} catch {
			// Log but respond 200 so PayMongo does not retry indefinitely
		}
		return { received: true }
	}
}
