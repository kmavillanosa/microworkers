import { apiBaseUrl, apiClient } from './client'
import type {
  ClipItem,
  FacebookStatusResponse,
  FontsResponse,
  NicheItem,
  OrderAudioFilter,
  Order,
  OrdersPageResponse,
  OrderPricing,
  PaymentMethodsResponse,
  PiperInstalledVoice,
  Pipeline,
  ReelItem,
  ReelJob,
  SettingsVoice,
  SocialAccount,
  StudioBootstrap,
  VoicesResponse,
  YoutubeStatusResponse,
} from './types'

const EMPTY_VOICES: VoicesResponse = {
  defaultEngine: 'edge',
  pyttsx3: [],
  edge: [],
  piper: {
    installed: [],
    catalog: [],
  },
}

const EMPTY_FONTS: FontsResponse = {
  defaultFont: 'default',
  items: [],
}

const EMPTY_PAYMENT_METHODS: PaymentMethodsResponse = {
  options: [],
  enabled: [],
}

const EMPTY_YOUTUBE_STATUS: YoutubeStatusResponse = {
  configured: false,
  accounts: [],
}

const EMPTY_FACEBOOK_STATUS: FacebookStatusResponse = {
  configured: false,
  facebookAccounts: [],
  instagramAccounts: [],
}

async function safeGet<TResponse>(
  request: () => Promise<TResponse>,
  fallback: TResponse,
): Promise<TResponse> {
  try {
    return await request()
  } catch {
    return fallback
  }
}

async function getBlob(path: string): Promise<Blob> {
  const response = await fetch(`${apiBaseUrl}${path}`)
  if (!response.ok) {
    throw new Error('Failed to fetch blob response')
  }

  return response.blob()
}

export const studioApi = {
  listClips: () => apiClient.get<ClipItem[]>('/api/clips'),
  uploadClip: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.post<ClipItem>('/api/clips', formData)
  },
  deleteClip: (clipId: string) => apiClient.remove(`/api/clips/${encodeURIComponent(clipId)}`),
  listOrderClips: () => apiClient.get<ClipItem[]>('/api/order-clips'),
  uploadOrderClip: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.post<ClipItem>('/api/order-clips', formData)
  },
  deleteOrderClip: (clipId: string) =>
    apiClient.remove(`/api/order-clips/${encodeURIComponent(clipId)}`),
  listReels: () => apiClient.get<ReelItem[]>('/api/reels'),
  listReelJobs: () => apiClient.get<ReelJob[]>('/api/reels/jobs'),
  listVoices: () => apiClient.get<VoicesResponse>('/api/reels/voices'),
  listFonts: () => apiClient.get<FontsResponse>('/api/reels/fonts'),
  uploadFont: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.post<{ id: string; name: string; filename: string; source: 'custom' | 'builtin' }>(
      '/api/fonts',
      formData,
    )
  },
  updateFont: (fontId: string, name: string) =>
    apiClient.patch<{ id: string; name: string; filename: string; source: 'custom' | 'builtin' }>(
      `/api/fonts/${encodeURIComponent(fontId)}`,
      { name },
    ),
  deleteFont: (fontId: string) => apiClient.remove(`/api/fonts/${encodeURIComponent(fontId)}`),
  listOrders: () => apiClient.get<Order[]>('/api/orders'),
  listOrdersPaged: (params?: {
    page?: number
    pageSize?: number
    search?: string
    status?: Order['orderStatus']
    paymentStatus?: Order['paymentStatus']
    audio?: OrderAudioFilter
  }) => {
    const query = new URLSearchParams()

    if (typeof params?.page === 'number' && Number.isFinite(params.page)) {
      query.set('page', String(Math.floor(params.page)))
    }

    if (typeof params?.pageSize === 'number' && Number.isFinite(params.pageSize)) {
      query.set('pageSize', String(Math.floor(params.pageSize)))
    }

    const search = params?.search?.trim()
    if (search) {
      query.set('search', search)
    }

    if (params?.status) {
      query.set('status', params.status)
    }

    if (params?.paymentStatus) {
      query.set('paymentStatus', params.paymentStatus)
    }

    if (params?.audio) {
      query.set('audio', params.audio)
    }

    const queryString = query.toString()
    return apiClient.get<OrdersPageResponse>(`/api/orders/paged${queryString ? `?${queryString}` : ''}`)
  },
  getOrderById: (orderId: string) => apiClient.get<Order>(`/api/orders/${encodeURIComponent(orderId)}`),
  listOrderReels: (orderId: string) =>
    apiClient.get<ReelItem[]>(`/api/orders/${encodeURIComponent(orderId)}/reels`),
  getOrderPricing: () => apiClient.get<OrderPricing>('/api/orders/pricing'),
  updateOrderPricing: (payload: {
    wordsPerFrame: number
    pricePerFramePesos: number
    clipOnly: number
    clipAndNarrator: number
  }) => apiClient.patch<OrderPricing>('/api/orders/pricing', payload),
  processOrder: (
    orderId: string,
    payload?: {
      useClipAudio?: boolean
      useClipAudioWithNarrator?: boolean
      script?: string
    },
  ) =>
    apiClient.post<{
      jobId: string
      status: ReelJob['status']
      progress: number
      createdAt?: string
    }>(`/api/orders/${encodeURIComponent(orderId)}/process`, payload ?? {}),
  deleteOrder: (orderId: string) => apiClient.remove(`/api/orders/${encodeURIComponent(orderId)}`),
  listAccounts: () => apiClient.get<SocialAccount[]>('/api/accounts'),
  listNiches: () => apiClient.get<NicheItem[]>('/api/captions/niches'),
  listPipelines: () => apiClient.get<Pipeline[]>('/api/pipeline'),
  getPaymentMethods: () => apiClient.get<PaymentMethodsResponse>('/api/settings/payment-methods'),
  updatePaymentMethodsEnabled: (enabled: string[]) =>
    apiClient.patch<{ enabled: string[] }>('/api/settings/payment-methods', {
      enabled,
    }),
  listSettingsVoices: () => apiClient.get<SettingsVoice[]>('/api/settings/voices'),
  updateSettingsVoiceEnabled: (voiceId: string, enabled: boolean) =>
    apiClient.patch<SettingsVoice>(`/api/settings/voices/${encodeURIComponent(voiceId)}`, {
      enabled,
    }),
  previewVoice: (voiceId: string, text?: string) => {
    const params = new URLSearchParams({ voiceId })
    if (typeof text === 'string' && text.trim()) {
      params.set('text', text.trim())
    }

    return getBlob(`/api/reels/voice-preview?${params.toString()}`)
  },
  installPiperVoice: (voiceId: string) =>
    apiClient.post<PiperInstalledVoice>('/api/reels/piper/install', {
      voiceId,
    }),
  getYoutubeStatus: () => apiClient.get<YoutubeStatusResponse>('/api/youtube/status'),
  getFacebookStatus: () => apiClient.get<FacebookStatusResponse>('/api/facebook/status'),
  deleteAllOrdersAndRelated: () =>
    apiClient.post<{
      ordersDeleted: number
      orderReelsDeleted: number
      orderClipsDeleted: number
    }>('/api/orders/delete-all', {
      confirm: 'DELETE_ALL_ORDERS',
    }),
}

export async function loadStudioBootstrap(): Promise<StudioBootstrap> {
  const [
    clips,
    orderClips,
    reels,
    reelJobs,
    voices,
    fonts,
    orderPricing,
    accounts,
    niches,
    pipelines,
    paymentMethods,
    settingsVoices,
    youtubeStatus,
    facebookStatus,
  ] = await Promise.all([
    safeGet(studioApi.listClips, []),
    safeGet(studioApi.listOrderClips, []),
    safeGet(studioApi.listReels, []),
    safeGet(studioApi.listReelJobs, []),
    safeGet(studioApi.listVoices, EMPTY_VOICES),
    safeGet(studioApi.listFonts, EMPTY_FONTS),
    safeGet(studioApi.getOrderPricing, null),
    safeGet(studioApi.listAccounts, []),
    safeGet(studioApi.listNiches, []),
    safeGet(studioApi.listPipelines, []),
    safeGet(studioApi.getPaymentMethods, EMPTY_PAYMENT_METHODS),
    safeGet(studioApi.listSettingsVoices, []),
    safeGet(studioApi.getYoutubeStatus, EMPTY_YOUTUBE_STATUS),
    safeGet(studioApi.getFacebookStatus, EMPTY_FACEBOOK_STATUS),
  ])

  return {
    clips,
    orderClips,
    reels,
    reelJobs,
    voices,
    fonts,
    orders: [],
    orderPricing,
    accounts,
    niches,
    pipelines,
    paymentMethods,
    settingsVoices,
    youtubeStatus,
    facebookStatus,
  }
}