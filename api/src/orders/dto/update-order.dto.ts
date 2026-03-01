import { IsBoolean, IsEmail, IsIn, IsOptional, IsString } from 'class-validator'

/** Partial update for an order (e.g. script revision, customer info, or clip-audio options before checkout). */
export class UpdateOrderDto {
	@IsString()
	@IsOptional()
	customerName?: string

	@IsEmail()
	@IsOptional()
	customerEmail?: string

	@IsString()
	@IsOptional()
	deliveryAddress?: string

	@IsString()
	@IsOptional()
	script?: string

	@IsString()
	@IsOptional()
	title?: string

	/** Output video size: phone, tablet, laptop, desktop. */
	@IsString()
	@IsOptional()
	@IsIn(['phone', 'tablet', 'laptop', 'desktop'])
	outputSize?: string

	@IsBoolean()
	@IsOptional()
	useClipAudio?: boolean

	@IsBoolean()
	@IsOptional()
	useClipAudioWithNarrator?: boolean
}
