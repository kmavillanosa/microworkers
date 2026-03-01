import { IsNumber, Min } from 'class-validator'

export class PaymongoQrDto {
	/** Amount in PHP pesos. Minimum ₱20 for QR Ph. */
	@IsNumber()
	@Min(20)
	amountPesos: number
}
