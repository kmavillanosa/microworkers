import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class MarkReelUploadedDto {
  @IsBoolean()
  @IsOptional()
  uploaded?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  youtubeUrl?: string;
}
