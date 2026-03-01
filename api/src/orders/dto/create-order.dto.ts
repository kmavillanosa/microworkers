import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class CreateOrderDto {
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

	@IsString()
	@IsNotEmpty()
	fontId: string

	@IsString()
	@IsOptional()
	clipName?: string

	@IsString()
	@IsNotEmpty()
	voiceEngine: string

	@IsString()
	@IsNotEmpty()
	voiceName: string

	/** Output video size: phone, tablet, laptop, desktop. Default phone. */
	@IsString()
	@IsOptional()
	@IsIn(['phone', 'tablet', 'laptop', 'desktop'])
	outputSize?: string

	/** Use the uploaded clip's audio (with transcript) instead of TTS. */
	@IsBoolean()
	@IsOptional()
	useClipAudio?: boolean

	/** Use clip audio and also add a TTS narrator (mixed). Requires useClipAudio. */
	@IsBoolean()
	@IsOptional()
	useClipAudioWithNarrator?: boolean
}
