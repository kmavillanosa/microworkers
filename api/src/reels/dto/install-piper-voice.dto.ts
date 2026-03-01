import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class InstallPiperVoiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  voiceId!: string;
}
