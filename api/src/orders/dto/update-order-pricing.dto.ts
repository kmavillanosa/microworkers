export class UpdateOrderPricingDto {
	wordsPerFrame?: number
	/** TTS narrator only (default tier). */
	pricePerFramePesos?: number
	/** Use clip audio (no narrator) — price per frame. */
	clipOnly?: number
	/** Use clip audio and add a narrator — price per frame. */
	clipAndNarrator?: number
}
