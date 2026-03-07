export type StudioOutputSize = 'phone' | 'tablet' | 'laptop' | 'desktop'

export function isStudioOutputSize(
  value: string | null | undefined,
): value is StudioOutputSize {
  return value === 'phone' || value === 'tablet' || value === 'laptop' || value === 'desktop'
}

export type ClipItem = {
  name: string
  displayName?: string
  filename?: string
  size?: number
  createdAt: string
  url: string
}

export type VoiceItem = {
  id: string
  name: string
  locale?: string
  country?: string
  language?: string
  gender?: string
  sample_text?: string
}

export type PiperCatalogItem = {
  id: string
  name: string
  description: string
  quality: 'medium' | 'high'
  installed: boolean
}

export type PiperInstalledVoice = {
  id: string
  name: string
  modelPath: string
  installed?: boolean
}

export type VoicesResponse = {
  defaultEngine: 'piper' | 'pyttsx3' | 'edge'
  defaultVoiceId?: string
  pyttsx3: VoiceItem[]
  edge: VoiceItem[]
  piper: {
    installed: PiperInstalledVoice[]
    catalog: PiperCatalogItem[]
  }
}

export type FontItem = {
  id: string
  name: string
  filename?: string
  source: 'custom' | 'builtin'
}

export type FontsResponse = {
  defaultFont: string
  items: FontItem[]
}

export type UploadRecord = {
  platform: 'youtube' | 'facebook' | 'instagram'
  accountId: string
  url: string
  uploadedAt: string
}

export type ReelItem = {
  id: string
  folder: string
  createdAt: string
  videoUrl: string
  srtUrl: string
  txtUrl: string
  uploaded: boolean
  uploadedAt?: string
  youtubeUrl?: string
  uploadLog?: UploadRecord[]
  orderId?: string
  showcase?: boolean
  showcaseTitle?: string
  showcaseDescription?: string
  outputSize?: StudioOutputSize
}

export type ReelJob = {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  stage?: string
  outputFolder?: string
  error?: string
  orderId?: string
}

export type Platform = 'youtube' | 'facebook' | 'instagram'

export type SocialAccount = {
  id: string
  platform: Platform
  label: string
  connected: boolean
  createdAt: string
}

export type NicheItem = {
  id: string
  label: string
  keywords: string
  rssFeeds: string[]
  createdAt: string
}

export type Pipeline = {
  id: string
  label: string
  enabled: boolean
  nicheId: string
  facebookAccountId: string
  facebookPageIds?: string[] | null
  voiceEngine: string
  voiceName: string
  fontName: string
  ollamaModel: string
  intervalHours: number
  createdAt: string
  lastRunAt: string | null
  lastRunStatus: string | null
  lastRunError: string | null
  isRunning?: boolean
}

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'processing'
  | 'ready_for_sending'
  | 'closed'

export type Order = {
  id: string
  customerName: string
  customerEmail: string
  deliveryAddress: string
  script: string
  title: string | null
  fontId: string
  clipName: string | null
  voiceEngine: string
  voiceName: string
  outputSize?: string | null
  useClipAudio?: boolean
  useClipAudioWithNarrator?: boolean
  bankCode: string | null
  paymentReference: string | null
  paymentDescriptor?: string | null
  paymentSessionId?: string | null
  paymentStatus: 'pending' | 'confirmed'
  orderStatus: OrderStatus
  createdAt: string
}

export type OrderAudioFilter = 'tts_only' | 'clip_only' | 'clip_and_narrator'

export type OrdersPageResponse = {
  items: Order[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type OrderPricing = {
  wordsPerFrame: number
  pricePerFramePesos: number
  pricePerFramePesosByTier?: {
    ttsOnly: number
    clipOnly: number
    clipAndNarrator: number
  }
  clipOnly?: number
  clipAndNarrator?: number
}

export type PaymentMethodsResponse = {
  options: Array<{ id: string; label: string }>
  enabled: string[]
}

export type MaintainanceModeResponse = {
  isOnMaintainanceMode: boolean
}

export type SettingsVoice = {
  id: string
  name: string
  locale: string
  country: string
  language: string
  gender: string
  enabled: boolean
}

export type YoutubeStatusResponse = {
  configured: boolean
  accounts: Array<{ id: string; label: string; connected: boolean }>
}

export type FacebookStatusResponse = {
  configured: boolean
  facebookAccounts: Array<{ id: string; label: string; connected: boolean }>
  instagramAccounts: Array<{ id: string; label: string; connected: boolean }>
}

export type StudioAuthUser = {
  id: string
  email: string
  displayName: string | null
  pictureUrl: string | null
  createdAt: string
  lastLoginAt: string | null
}

export type StudioAuthSession = {
  accessToken: string
  user: StudioAuthUser
}

export type StudioBootstrap = {
  clips: ClipItem[]
  orderClips: ClipItem[]
  reels: ReelItem[]
  reelJobs: ReelJob[]
  voices: VoicesResponse
  fonts: FontsResponse
  orders: Order[]
  orderPricing: OrderPricing | null
  accounts: SocialAccount[]
  niches: NicheItem[]
  pipelines: Pipeline[]
  paymentMethods: PaymentMethodsResponse
  isOnMaintainanceMode: boolean
  settingsVoices: SettingsVoice[]
  youtubeStatus: YoutubeStatusResponse
  facebookStatus: FacebookStatusResponse
}