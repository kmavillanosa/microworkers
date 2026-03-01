import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator'

export class UploadFacebookPhotoDto {
  @IsString()
  @MaxLength(180)
  accountId!: string

  /** Public URL of the image to post (e.g. from RSS enclosure or media:content). */
  @IsString()
  imageUrl!: string

  @IsString()
  @MaxLength(2200)
  caption!: string

  /** When set, post only to these page IDs; when omitted or empty, post to all pages the account manages */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pageIds?: string[]
}
