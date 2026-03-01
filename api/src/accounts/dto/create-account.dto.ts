import { IsIn, IsString, MaxLength } from 'class-validator'
import type { Platform } from '../account.types'

export class CreateAccountDto {
  @IsIn(['youtube', 'facebook', 'instagram'])
  platform!: Platform

  @IsString()
  @MaxLength(120)
  label!: string
}
