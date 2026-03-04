/**
 * Clip item from assets/cache, assets/game-clips, or assets/order-clips
 */
export type ClipItem = {
  name: string;
  displayName?: string;
  filename?: string;
  size?: number;
  createdAt: string;
  url: string;
};

/**
 * TTS voice from pyttsx3, Edge TTS, or Piper
 */
export type VoiceItem = {
  id: string;
  name: string;
};

/**
 * Font file available for text rendering
 */
export type FontItem = {
  id: string;
  name: string;
  filename?: string;
  source: "custom" | "builtin";
};

/**
 * Piper TTS model in the catalog
 */
export type PiperCatalogItem = {
  id: string;
  name: string;
  description: string;
  quality: "medium" | "high";
  installed: boolean;
};

/**
 * Response from /api/voices endpoint
 */
export type VoicesResponse = {
  defaultEngine: "piper" | "pyttsx3" | "edge";
  pyttsx3: VoiceItem[];
  edge: Array<{ id: string; name: string; locale: string }>;
  piper: {
    installed: Array<{ id: string; name: string; modelPath: string }>;
    catalog: PiperCatalogItem[];
  };
};

/**
 * Response from /api/fonts endpoint
 */
export type FontsResponse = {
  defaultFont: string;
  items: FontItem[];
};

/**
 * Studio preview size options
 */
export type StudioPreviewSize = "phone" | "tablet" | "laptop" | "desktop";

/**
 * Order status in the Kanban board
 */
export type OrderStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "processing"
  | "ready_for_sending"
  | "closed";

/**
 * Customer order for video generation
 */
export type Order = {
  id: string;
  customerName: string;
  customerEmail: string;
  deliveryAddress: string;
  script: string;
  title: string | null;
  fontId: string;
  clipName: string | null;
  voiceEngine: string;
  voiceName: string;
  /** Output video size: phone, tablet, laptop, desktop. */
  outputSize?: string | null;
  useClipAudio?: boolean;
  useClipAudioWithNarrator?: boolean;
  bankCode: string | null;
  paymentReference: string | null;
  /** PayMongo statement_descriptor or transaction descriptor. */
  paymentDescriptor?: string | null;
  paymentStatus: "pending" | "confirmed";
  orderStatus: OrderStatus;
  createdAt: string;
  scriptPosition?: string | null;
  scriptStyle?: {
    fontScale?: number;
    bgOpacity?: number;
    animationMode?: "calming" | "normal" | "extreme";
  } | null;
};

/**
 * Transcript information for a clip
 */
export type ClipTranscriptInfo = {
  status: string | null;
  text: string | null;
  error: string | null;
  updatedAt: string | null;
  language: string | null;
  languageProbability: number | null;
};

/**
 * Social media upload record for a reel
 */
export type UploadRecord = {
  platform: "youtube" | "facebook" | "instagram";
  accountId: string;
  url: string;
  uploadedAt: string;
};

/**
 * Generated reel video
 */
export type ReelItem = {
  id: string;
  folder: string;
  createdAt: string;
  videoUrl: string;
  srtUrl: string;
  txtUrl: string;
  uploaded: boolean;
  uploadedAt?: string;
  youtubeUrl?: string;
  uploadLog: UploadRecord[];
  nicheId?: string;
  nicheLabel?: string;
  orderId?: string;
  showcase?: boolean;
  showcaseTitle?: string;
  showcaseDescription?: string;
};

/**
 * Background job for reel generation
 */
export type ReelJob = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  stage?: string;
  outputFolder?: string;
  error?: string;
  orderId?: string;
};

/**
 * Social media platform
 */
export type Platform = "youtube" | "facebook" | "instagram";

/**
 * Content niche for automated reel generation
 */
export type NicheItem = {
  id: string;
  label: string;
  keywords: string;
  rssFeeds: string[];
  createdAt: string;
};

/**
 * Automated pipeline for posting reels
 */
export type Pipeline = {
  id: string;
  label: string;
  enabled: boolean;
  nicheId: string;
  facebookAccountId: string;
  /** When set, post only to these page IDs; when null/empty, post to all pages */
  facebookPageIds?: string[] | null;
  voiceEngine: string;
  voiceName: string;
  fontName: string;
  ollamaModel: string;
  lang?: string;
  intervalHours: number;
  createdAt: string;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
  isRunning?: boolean;
};

/**
 * Connected social media account
 */
export type SocialAccount = {
  id: string;
  platform: Platform;
  label: string;
  connected: boolean;
  createdAt: string;
};

/**
 * Response from /api/youtube/status endpoint
 */
export type YoutubeStatusResponse = {
  configured: boolean;
  accounts: Array<{ id: string; label: string; connected: boolean }>;
};

/**
 * Response from /api/facebook/status endpoint
 */
export type FacebookStatusResponse = {
  configured: boolean;
  facebookAccounts: Array<{ id: string; label: string; connected: boolean }>;
  instagramAccounts: Array<{ id: string; label: string; connected: boolean }>;
};

/**
 * Voice available in settings with toggle status
 */
export type SettingsVoice = {
  id: string;
  name: string;
  locale: string;
  country: string;
  language: string;
  gender: string;
  enabled: boolean;
};
