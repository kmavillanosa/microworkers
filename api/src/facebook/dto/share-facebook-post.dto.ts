import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator'

export class ShareFacebookPostDto {
  @IsString()
  @MaxLength(180)
  accountId!: string

  @IsString()
  @MaxLength(2000)
  postUrl!: string

  @IsString()
  @IsOptional()
  @MaxLength(2200)
  message?: string

  @IsString()
  @IsOptional()
  @MaxLength(180)
  sourcePageId?: string

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  @IsOptional()
  targetPageIds?: string[]
}
