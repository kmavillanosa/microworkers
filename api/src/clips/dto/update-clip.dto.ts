import { IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateClipDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string
}
