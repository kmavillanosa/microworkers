import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator'

export class UploadFacebookDto {
  @IsString()
  @MaxLength(180)
  reelId!: string

  @IsString()
  @MaxLength(180)
  accountId!: string

  @IsString()
  @IsOptional()
  @MaxLength(2200)
  caption?: string

  /** When set, post only to these page IDs; when omitted or empty, post to all pages the account manages */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pageIds?: string[]
}
