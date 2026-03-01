import { IsBoolean, IsOptional, IsString } from 'class-validator'

export class ProcessOrderDto {
  @IsBoolean()
  @IsOptional()
  useClipAudio?: boolean

  @IsBoolean()
  @IsOptional()
  useClipAudioWithNarrator?: boolean

  /** Optional script override (e.g. backoffice fixes typos from transcript). Used when provided; for clip+narrator, caption timing then comes from TTS. */
  @IsString()
  @IsOptional()
  script?: string
}
