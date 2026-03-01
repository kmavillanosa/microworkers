import { IsString, MaxLength } from 'class-validator'

export class UpdateLabelDto {
  @IsString()
  @MaxLength(120)
  label!: string
}
