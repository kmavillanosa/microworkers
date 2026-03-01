import { Body, Controller, Post } from '@nestjs/common'
import { OrdersService } from '../orders/orders.service'
import {
	PaymongoService,
	type CheckoutSessionResource,
} from '../paymongo/paymongo.service'

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

		const orderIdResolved = orderId ?? orderIdFromPayload
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
