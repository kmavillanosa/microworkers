export type ReelJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type VoiceEngine = 'pyttsx3' | 'piper' | 'edge' | 'none';
export type UploadPlatform = 'youtube' | 'facebook' | 'instagram';

export interface UploadRecord {
  platform: UploadPlatform;
  accountId: string;
  /** For Facebook: the specific page ID that received the upload */
  pageId?: string;
  url: string;
  uploadedAt: string;
}

export type BgMode = 'clip' | 'auto' | 'caption';

export interface ReelJob {
  id: string;
  script: string;
  title?: string;
  clipName?: string;
  fontName?: string;
  voiceEngine: VoiceEngine;
  voiceName?: string;
  voiceRate: number;
  bgMode: BgMode;
  status: ReelJobStatus;
  progress: number;
  stage?: string;
  createdAt: string;
  updatedAt: string;
  outputFolder?: string;
  error?: string;
  /** Set when reel is created by a pipeline (niche source). */
  nicheId?: string;
  nicheLabel?: string;
  /** Optional originating customer order id (back office orders). */
  orderId?: string;
  /** Output video size: phone (9:16), tablet (4:3), laptop (16:10), desktop (16:9). */
  outputSize?: 'phone' | 'tablet' | 'laptop' | 'desktop';
  /** Use clip audio instead of generating narration. */
  useClipAudio?: boolean;
  /** Use clip audio and also add TTS narrator (mixed). */
  useClipAudioWithNarrator?: boolean;
  /** Optional transcript segments for timing captions to audio. */
  transcriptSegments?: Array<{ start: number; end: number; text: string }>;
  /** Script/caption position: top, center, bottom. */
  scriptPosition?: 'top' | 'center' | 'bottom';
  /** Script/caption style: { fontScale?, bgOpacity?, animationMode? }. */
  scriptStyle?: Record<string, unknown>;
}

export interface ReelItem {
  id: string;
  folder: string;
  createdAt: string;
  videoUrl: string;
  srtUrl: string;
  txtUrl: string;
  /** Narration audio file when saved by generator (reel-audio.wav). */
  audioUrl?: string;
  uploaded: boolean;
  uploadedAt?: string;
  youtubeUrl?: string;
  uploadLog: UploadRecord[];
  /** Niche this reel was generated from (pipeline-created reels). */
  nicheId?: string;
  nicheLabel?: string;
  /** Originating order id, if this reel was generated from an order. */
  orderId?: string;
  /** When true, reel appears on web-orders showcase. */
  showcase?: boolean;
  showcaseTitle?: string;
  showcaseDescription?: string;
  /** Output size: phone, tablet, laptop, desktop. For aspect-ratio on showcase. */
  outputSize?: 'phone' | 'tablet' | 'laptop' | 'desktop';
}
