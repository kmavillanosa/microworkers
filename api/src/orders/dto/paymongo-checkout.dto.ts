import { IsNotEmpty, IsNumber, IsString, IsUrl, Min } from 'class-validator'

export class PaymongoCheckoutDto {
	/** Amount in PHP pesos (determined by your computation). */
	@IsNumber()
	@Min(1)
	amountPesos: number

	@IsString()
	@IsNotEmpty()
	@IsUrl({ require_tld: false })
	successUrl: string

	@IsString()
	@IsNotEmpty()
	@IsUrl({ require_tld: false })
	cancelUrl: string
}
