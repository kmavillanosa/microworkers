import { IsNotEmpty, IsNumber, IsObject, IsString, IsUrl, Min } from 'class-validator'

export class PrepareCheckoutDto {
	@IsObject()
	@IsNotEmpty()
	orderPayload: Record<string, unknown>

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
