import { Injectable } from '@nestjs/common'

const PAYMONGO_API = 'https://api.paymongo.com/v1'

export interface CreateCheckoutParams {
	orderId: string
	amountPesos: number
	description: string
	successUrl: string
	cancelUrl: string
	/** Prefill billing on the payment page when provided. */
	billing?: {
		name?: string
		email?: string
		address?: { line1?: string }
	}
	/** Payment method types to show (e.g. ['gcash']). Defaults to gcash only if not set. */
	paymentMethodTypes?: string[]
}

@Injectable()
export class PaymongoService {
	private getSecretKey(): string {
		const key = process.env.PAYMONGO_SECRET_KEY
		if (!key || !key.startsWith('sk_')) {
			throw new Error('PAYMONGO_SECRET_KEY is not set or invalid (must start with sk_)')
		}
		return key
	}

	/**
	 * Create a PayMongo Checkout Session and return the checkout URL.
	 * Amount is in PHP pesos; PayMongo expects centavos in line_items.
	 */
	async createCheckoutSession(params: CreateCheckoutParams): Promise<{ checkoutUrl: string }> {
		const secretKey = this.getSecretKey()
		const amountCentavos = Math.round(params.amountPesos * 100)
		if (amountCentavos < 100) {
			throw new Error('Amount must be at least ₱1.00')
		}

		const paymentMethodTypes =
			params.paymentMethodTypes?.length ? params.paymentMethodTypes : ['gcash']
		const attributes: Record<string, unknown> = {
			line_items: [
				{
					amount: amountCentavos,
					currency: 'PHP',
					name: 'Reel order',
					quantity: 1,
					description: params.description.slice(0, 255),
				},
			],
			payment_method_types: paymentMethodTypes,
			success_url: params.successUrl,
			cancel_url: params.cancelUrl,
			description: params.description.slice(0, 255),
			show_line_items: true,
			metadata: {
				order_id: params.orderId,
			},
		}
		if (params.billing && (params.billing.name || params.billing.email || params.billing.address?.line1)) {
			attributes.billing = {
				...(params.billing.name && { name: params.billing.name.slice(0, 255) }),
				...(params.billing.email && { email: params.billing.email.slice(0, 255) }),
				...(params.billing.address?.line1 && {
					address: { line1: params.billing.address.line1.slice(0, 255) },
				}),
			}
		}
		const body = {
			data: {
				attributes,
			},
		}

		const auth = Buffer.from(`${secretKey}:`).toString('base64')
		const res = await fetch(`${PAYMONGO_API}/checkout_sessions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Basic ${auth}`,
			},
			body: JSON.stringify(body),
		})

		if (!res.ok) {
			const err = await res.text()
			throw new Error(`PayMongo checkout failed: ${res.status} ${err}`)
		}

		const data = (await res.json()) as {
			data?: { attributes?: { checkout_url?: string } }
		}
		const checkoutUrl = data?.data?.attributes?.checkout_url
		if (!checkoutUrl) {
			throw new Error('PayMongo did not return checkout_url')
		}
		return { checkoutUrl }
	}

	/**
	 * Retrieve a Checkout Session by id (e.g. from webhook).
	 * Uses secret key so payments array and billing are included.
	 */
	async getCheckoutSession(sessionId: string): Promise<CheckoutSessionResource | null> {
		const secretKey = this.getSecretKey()
		const auth = Buffer.from(`${secretKey}:`).toString('base64')
		const res = await fetch(`${PAYMONGO_API}/checkout_sessions/${sessionId}`, {
			headers: { Authorization: `Basic ${auth}` },
		})
		if (!res.ok) return null
		const json = (await res.json()) as { data?: CheckoutSessionResource }
		return json?.data ?? null
	}
}

/** Checkout Session resource as returned by PayMongo (for webhook + retrieve). */
export interface CheckoutSessionResource {
	id?: string
	type?: string
	attributes?: {
		metadata?: { order_id?: string }
		reference_number?: string
		billing?: {
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
		payments?: Array<{
			id?: string
			type?: string
			attributes?: {
				billing?: {
					name?: string
					email?: string
					phone?: string
					address?: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string }
				}
				statement_descriptor?: string
				external_reference_number?: string
			}
		}>
	}
}
