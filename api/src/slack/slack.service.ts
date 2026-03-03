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
	 * No-op if SLACK_ORDER_WEBHOOK_URL is not set.
	 */
	async notifyOrder(payload: SlackOrderPayload): Promise<void> {
		if (!this.webhookUrl) {
			this.logger.debug('SLACK_ORDER_WEBHOOK_URL not set; skipping Slack notification')
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
			const res = await fetch(this.webhookUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					text,
					unfurl_links: false,
					unfurl_media: false,
				}),
			})
			if (!res.ok) {
				this.logger.warn(
					`Slack webhook returned ${res.status}: ${await res.text()}`,
				)
			}
		} catch (err) {
			this.logger.warn(
				`Slack notification failed: ${err instanceof Error ? err.message : String(err)}`,
			)
		}
	}
}
