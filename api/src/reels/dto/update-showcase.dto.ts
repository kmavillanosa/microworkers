import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateShowcaseDto {
  @IsBoolean()
  showcase: boolean;

  @IsOptional()
  @IsString()
  showcaseTitle?: string;

  @IsOptional()
  @IsString()
  showcaseDescription?: string;
}
