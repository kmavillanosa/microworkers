import { Injectable, Logger } from '@nestjs/common'

/** Payload for Slack order notification. */
export interface SlackOrderPayload {
	receiptLink: string
	customerName: string
	customerEmail: string
	amountPesos: number
	orderType: string
	orderId: string
}

@Injectable()
export class SlackService {
	private readonly logger = new Logger(SlackService.name)
	private readonly webhookUrl = process.env.SLACK_ORDER_WEBHOOK_URL?.trim() ?? ''

	/**
	 * Send a new-order notification to the configured Slack channel.
	 * Called when payment is confirmed (PayMongo webhook or manual PATCH payment), not when the order is first created.
	 * No-op if SLACK_ORDER_WEBHOOK_URL is not set. Restart the API after adding the env var.
	 */
	async notifyOrder(payload: SlackOrderPayload): Promise<void> {
		if (!this.webhookUrl) {
			this.logger.log(
				'Slack: SLACK_ORDER_WEBHOOK_URL is not set; skipping order notification. Set it in .env and restart the API.',
			)
			return
		}
		const who =
			payload.customerName || payload.customerEmail || '—'
		const text = [
			`*New order*`,
			`• Receipt: ${payload.receiptLink}`,
			`• Who: ${who}`,
			`• Amount: ₱${payload.amountPesos.toLocaleString()}`,
			`• Type: ${payload.orderType}`,
			`• Order ID: \`${payload.orderId}\``,
		].join('\n')
		try {
			this.logger.log(`Slack: sending order notification for order ${payload.orderId}`)
			const res = await fetch(this.webhookUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					text,
					unfurl_links: false,
					unfurl_media: false,
				}),
			})
			if (res.ok) {
				this.logger.log(`Slack: notification sent for order ${payload.orderId}`)
			} else {
				this.logger.warn(
					`Slack webhook returned ${res.status} for order ${payload.orderId}: ${await res.text()}`,
				)
			}
		} catch (err) {
			this.logger.warn(
				`Slack notification failed for order ${payload.orderId}: ${err instanceof Error ? err.message : String(err)}`,
			)
		}
	}
}
