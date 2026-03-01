import { IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateFontDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string
}
