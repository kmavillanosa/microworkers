import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class TranscriptSegmentDto {
  @IsNumber()
  start: number;

  @IsNumber()
  end: number;

  @IsString()
  @MaxLength(4000)
  text: string;
}

export class CreateReelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  script!: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(260)
  clipName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  fontName?: string;

  @IsString()
  @IsOptional()
  @IsIn(['pyttsx3', 'piper', 'edge', 'none'])
  voiceEngine?: 'pyttsx3' | 'piper' | 'edge' | 'none';

  @IsString()
  @IsOptional()
  @MaxLength(260)
  voiceName?: string;

  @IsInt()
  @Min(120)
  @Max(260)
  @IsOptional()
  voiceRate?: number;

  @IsBoolean()
  @IsOptional()
  useClipAudio?: boolean;

  /** When true, use clip audio and also add TTS narrator (mixed). Requires useClipAudio + transcriptSegments. */
  @IsBoolean()
  @IsOptional()
  useClipAudioWithNarrator?: boolean;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => TranscriptSegmentDto)
  transcriptSegments?: TranscriptSegmentDto[];

  /**
   * Background mode:
   * - 'clip'    — use the specified clipName (default behaviour)
   * - 'auto'    — pick a random clip from the clips directory
   * - 'caption' — generate a fully procedural animated background from the script text
   */
  @IsString()
  @IsOptional()
  @IsIn(['clip', 'auto', 'caption'])
  bgMode?: 'clip' | 'auto' | 'caption';

  @IsString()
  @IsOptional()
  @MaxLength(120)
  nicheId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(180)
  nicheLabel?: string;

  /**
   * Optional originating order id, when a reel is generated
   * from a customer order in the back office.
   */
  @IsString()
  @IsOptional()
  @MaxLength(64)
  orderId?: string;

  /**
   * Output video size: phone (9:16), tablet (4:3), laptop (16:10), desktop (16:9).
   * When omitted, defaults to phone.
   */
  @IsString()
  @IsOptional()
  @IsIn(['phone', 'tablet', 'laptop', 'desktop'])
  outputSize?: 'phone' | 'tablet' | 'laptop' | 'desktop';
}
