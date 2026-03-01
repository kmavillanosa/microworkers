import { IsNotEmpty, IsString } from 'class-validator'

export class ConfirmPaymentDto {
	@IsString()
	@IsNotEmpty()
	bankCode: string

	@IsString()
	@IsNotEmpty()
	paymentReference: string
}
