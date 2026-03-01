import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

export class UploadYoutubeDto {
  @IsString()
  @MaxLength(180)
  reelId!: string

  @IsString()
  @MaxLength(180)
  accountId!: string

  @IsString()
  @MaxLength(100)
  title!: string

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[]

  @IsString()
  @IsOptional()
  @IsIn(['private', 'unlisted', 'public'])
  privacyStatus?: 'private' | 'unlisted' | 'public'
}
