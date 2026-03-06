import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Joyride, { STATUS, type Step } from 'react-joyride'

/** API base (no trailing slash). Empty = same origin (works with http and https when served from same host). */
const API = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

interface FontItem {
  id: string
  name: string
}
interface ClipItem {
  name: string
  displayName?: string
  url: string
}
interface ClipTranscriptInfo {
  status: string | null
  text: string | null
  error: string | null
  updatedAt: string | null
  language: string | null
  languageProbability: number | null
  /** Video length in seconds (order clips). Used for max-words guidance. */
  durationSeconds?: number | null
  /** Max words that fit in the video span so script matches length. */
  maxWordsForNarration?: number | null
}

/** Whether the font id is a custom file we can load from /media/fonts/ */
function isCustomFontFile(fontId: string): boolean {
  const lower = fontId.toLowerCase()
  return lower.endsWith('.ttf') || lower.endsWith('.otf')
}

/** CSS font-family for a font id (for dropdown and preview) */
function fontFamilyFor(fontId: string): string {
  if (!fontId) return 'inherit'
  if (isCustomFontFile(fontId)) {
    return `"OrderFont-${fontId.replace(/[^a-z0-9.-]/gi, '_')}", sans-serif`
  }
  const lower = fontId.toLowerCase()
  if (lower === 'default') return 'system-ui, sans-serif'
  return `"${fontId}", sans-serif`
}
interface EdgeVoice {
  id: string
  name: string
  locale?: string
  country?: string
  language?: string
  gender?: string
  sample_text?: string
}
interface VoicesRes {
  defaultEngine: string
  defaultVoiceId: string
  edge: EdgeVoice[]
  pyttsx3: Array<{ id: string; name: string }>
  piper: { installed: Array<{ id: string; name: string }>; catalog: Array<{ id: string; name: string; installed: boolean }> }
}

/** Regional indicator flag from locale (e.g. en-US -> US -> 🇺🇸). */
function localeToFlag(locale: string | undefined): string {
  if (!locale) return ''
  const part = locale.split('-').pop() ?? ''
  const cc = part.toUpperCase()
  if (cc.length !== 2) return ''
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0)))
}

/** Split script into frames; each frame has up to wordsPerFrame words. */
function scriptToFrames(scriptText: string, wordsPerFrame: number): string[] {
  const words = scriptText.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0 || wordsPerFrame < 1) return []
  const frames: string[] = []
  for (let i = 0; i < words.length; i += wordsPerFrame) {
    frames.push(words.slice(i, i + wordsPerFrame).join(' '))
  }
  return frames
}

/** Word count of the given text. */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Format duration in seconds as M:SS for display. */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return s < 10 ? `${m}:0${s}` : `${m}:${s}`
}

function formatCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** Same as API: max words that fit in duration at typical TTS pace. */
const WORDS_PER_SECOND = 2.5
function maxWordsForDuration(seconds: number): number {
  return Math.max(0, Math.floor(seconds * WORDS_PER_SECOND))
}

/** Get video duration in seconds from a File or video URL (browser only, no server). */
function getVideoDurationInBrowser(fileOrUrl: File | string): Promise<number | null> {
  return new Promise((resolve) => {
    const url = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl)
    const video = document.createElement('video')
    video.preload = 'metadata'
    const onDone = () => {
      if (typeof fileOrUrl === 'object') URL.revokeObjectURL(url)
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', onDone)
      video.src = ''
    }
    const onLoaded = () => {
      const d = video.duration
      if (Number.isFinite(d) && d > 0) resolve(d)
      else resolve(null)
      onDone()
    }
    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('error', onDone)
    video.src = url
  })
}

export type PreviewSize = 'phone' | 'tablet' | 'laptop' | 'desktop'
type CaptionAnimationMode = 'calming' | 'normal' | 'extreme'
type ScriptStyle = { fontScale?: number; bgOpacity?: number; animationMode?: CaptionAnimationMode }

function normalizeCaptionAnimationMode(value: unknown): CaptionAnimationMode {
  if (value === 'calming' || value === 'normal' || value === 'extreme') {
    return value
  }
  return 'normal'
}

const PREVIEW_SIZES: { id: PreviewSize; label: string }[] = [
  { id: 'phone', label: 'Phone' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'laptop', label: 'Laptop' },
  { id: 'desktop', label: 'Desktop' },
]

const ORDER_TOUR_STORAGE_KEY = 'reelagad-order-tour-done'
const ORDER_FORM_DRAFT_KEY = 'reelagad_order_form_draft'

/** Persisted form state when user goes to PayMongo so we can restore on back. */
interface OrderFormDraft {
  script: string
  title: string
  fontId: string
  clipName: string
  voiceEngine: string
  voiceName: string
  useClipAudio: boolean
  useClipAudioWithNarrator: boolean
  scriptPosition: 'top' | 'center' | 'bottom'
  scriptStyle: ScriptStyle
  previewSize: PreviewSize
  customerName: string
  customerEmail: string
  deliveryAddress: string
  /** Server URL of uploaded clip (not blob) so we can show video again. */
  uploadedClipUrl?: string | null
}

const ORDER_FORM_STEPS: Step[] = [
  {
    target: '.order-page-hero',
    content: 'Welcome! This form walks you through creating a reel: script, look, voice, and your details. Follow the steps or use "Take a tour" anytime.',
    disableBeacon: true,
  },
  {
    target: '#order-script',
    content: 'Paste or type your script here. If you add a video with speech below, we can transcribe it for you.',
    disableBeacon: true,
  },
  {
    target: '#order-title',
    content: 'Optional title for your reel (e.g. for file name or display).',
    disableBeacon: true,
  },
  {
    target: '#order-font',
    content: 'Choose the font for your captions. You can pick a built-in font or use a custom one.',
    disableBeacon: true,
  },
  {
    target: '#order-clip',
    content: 'Select a background clip or upload your own video. The clip sets the look and can provide speech for transcription.',
    disableBeacon: true,
  },
  {
    target: '#order-voice',
    content: 'Pick the voice that will read your script. Different engines (Edge, Piper, etc.) offer different tones.',
    disableBeacon: true,
  },
  {
    target: '.order-preview-column',
    content: 'Live preview of your reel and price. Change the device size to see how it looks on phone, tablet, or desktop.',
    disableBeacon: true,
  },
  {
    target: '#order-customer-name',
    content: 'Your details are optional. If you fill them in, they’ll be prefilled on the payment page.',
    disableBeacon: true,
  },
  {
    target: '#order-form-submit-wrap',
    content: 'Choose "Pay with QRPH" to generate a code you can scan with GCash, Maya, or your bank app (min ₱20). You’ll get your reel when it’s done.',
    disableBeacon: true,
  },
]

function ImpersonationAlert({ orderId }: { orderId: string }) {
  return (
    <section className="impersonation-alert" role="alert" aria-live="polite">
      <p className="impersonation-alert-text">
        Order <span className="impersonation-alert-order-id">{orderId}</span> is currently being impersonated.
      </p>
    </section>
  )
}

/** Classify video dimensions into preview size (phone = portrait, tablet = square/portrait, laptop = landscape, desktop = ultra-wide). */
function previewSizeFromDimensions(width: number, height: number): PreviewSize {
  if (!width || !height) return 'phone'
  const ratio = width / height
  if (ratio < 0.75) return 'phone'
  if (ratio < 1.1) return 'tablet'
  if (ratio <= 1.85) return 'laptop'
  return 'desktop'
}

interface OrderSnapshot {
  id: string
  customerName?: string
  customerEmail?: string
  deliveryAddress?: string
  script: string
  title: string | null
  fontId: string
  clipName: string | null
  voiceEngine: string
  voiceName: string
  outputSize?: string | null
  useClipAudio?: boolean
  useClipAudioWithNarrator?: boolean
  scriptPosition?: 'top' | 'center' | 'bottom'
  scriptStyle?: ScriptStyle
}

export default function OrderPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [orderId, setOrderId] = useState<string | null>(null)
  const isImpersonating = searchParams.has('impersonate')
  const orderIdFromQuery = searchParams.get('orderId')
  const [impersonatedOriginalOrder, setImpersonatedOriginalOrder] = useState<OrderSnapshot | null>(null)

  const [fonts, setFonts] = useState<FontItem[]>([])
  const [clips, setClips] = useState<ClipItem[]>([])
  type VoiceOption = { id: string; name: string; engine: string; locale?: string; country?: string; language?: string; gender?: string; sample_text?: string }
  const [voices, setVoices] = useState<VoiceOption[]>([])
  const [voiceSearchOpen, setVoiceSearchOpen] = useState(false)
  const [voiceSearchQuery, setVoiceSearchQuery] = useState('')
  const [voiceHighlightIndex, setVoiceHighlightIndex] = useState(-1)
  const [voicePreviewLoading, setVoicePreviewLoading] = useState(false)
  const voiceSearchInputRef = useRef<HTMLInputElement>(null)
  const voicePickerRef = useRef<HTMLDivElement>(null)
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!voiceSearchOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (voicePickerRef.current && !voicePickerRef.current.contains(e.target as Node)) {
        setVoiceSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [voiceSearchOpen])
  const [pricing, setPricing] = useState<{
    wordsPerFrame: number
    pricePerFramePesos: number
    pricePerFramePesosByTier?: { ttsOnly: number; clipOnly: number; clipAndNarrator: number }
  } | null>(null)

  const [script, setScript] = useState('')
  const scriptValueRef = useRef('')
  const [title, setTitle] = useState('')
  const [fontId, setFontId] = useState('')
  const [clipName, setClipName] = useState('')
  /** When user uploads a video, we store its URL for preview (clipName holds the filename for the order). */
  const [uploadedClipUrl, setUploadedClipUrl] = useState<string | null>(null)
  const [uploadingClip, setUploadingClip] = useState(false)
  const [clipTranscript, setClipTranscript] = useState<ClipTranscriptInfo | null>(null)
  /** Duration and max words from the video (browser-side, no server ffprobe). Prefer over API when set. */
  const [clipDurationSeconds, setClipDurationSeconds] = useState<number | null>(null)
  const [clipMaxWords, setClipMaxWords] = useState<number | null>(null)
  /** Only fill script from transcript once per clip; avoid overwriting user edits when poll runs again. */
  const scriptFilledForClipRef = useRef<string | null>(null)
  const [voiceEngine, setVoiceEngine] = useState('edge')
  const [voiceName, setVoiceName] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  /** Use clip audio only (no TTS narrator). Only relevant when a clip is selected. */
  const [useClipAudio, setUseClipAudio] = useState(false)
  /** Use clip audio and add TTS narrator (mixed). Only relevant when a clip is selected. */
  const [useClipAudioWithNarrator, setUseClipAudioWithNarrator] = useState(false)
  /** When true, user may submit even if script exceeds recommended word count for the video length. */
  const [proceedOverWordLimit, setProceedOverWordLimit] = useState(false)

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [previewFrameIndex, setPreviewFrameIndex] = useState(0)
  const [runTour, setRunTour] = useState(false)
  const [previewSize, setPreviewSize] = useState<PreviewSize>('phone')
  /** PayMongo QR Ph: after creating payment intent we show scan-to-pay page with PayMongo's QR (amount >= ₱20). */
  const [paymongoQrImageUrl, setPaymongoQrImageUrl] = useState<string | null>(null)
  const [paymongoAmountPesos, setPaymongoAmountPesos] = useState<number | null>(null)
  const [paymongoOrderId, setPaymongoOrderId] = useState<string | null>(null)
  const [paymongoPaymentIntentId, setPaymongoPaymentIntentId] = useState<string | null>(null)
  const [paymongoQrExpiresAt, setPaymongoQrExpiresAt] = useState<string | null>(null)
  const [qrSecondsLeft, setQrSecondsLeft] = useState<number | null>(null)
  const [qrPaymentConfirmed, setQrPaymentConfirmed] = useState(false)
  const [qrPaymentStatusMessage, setQrPaymentStatusMessage] = useState('Waiting for payment confirmation…')
  const [downloadingQr, setDownloadingQr] = useState(false)
  /** Script/caption position on video: top, center, bottom. Center only when no title. */
  const [scriptPosition, setScriptPosition] = useState<'top' | 'center' | 'bottom'>('bottom')
  /** Script/caption style for output video. */
  const [scriptStyle, setScriptStyle] = useState<ScriptStyle>({ fontScale: 1, bgOpacity: 180, animationMode: 'normal' })

  /** From API GET /api/orders/pricing; safe fallbacks only when API has not responded yet. */
  const wordsPerFrame = pricing?.wordsPerFrame ?? 1
  const tiers = pricing?.pricePerFramePesosByTier ?? {
    ttsOnly: 3,
    clipOnly: 5,
    clipAndNarrator: 7,
  }
  const pricePerFramePesos =
    !useClipAudio && !useClipAudioWithNarrator
      ? tiers.ttsOnly
      : useClipAudioWithNarrator
        ? tiers.clipAndNarrator
        : tiers.clipOnly
  const effectiveScript = script.trim() || clipTranscript?.text || ''
  const previewFrames = scriptToFrames(effectiveScript, wordsPerFrame)
  const transcriptLanguage = clipTranscript?.language
    ? clipTranscript.language.toUpperCase()
    : null
  const transcriptConfidence =
    typeof clipTranscript?.languageProbability === 'number'
      ? Math.round(clipTranscript.languageProbability * 100)
      : null
  const safeFrameIndex =
    previewFrames.length === 0 ? 0 : Math.min(previewFrameIndex, previewFrames.length - 1)
  const currentFrameText = previewFrames[safeFrameIndex] ?? ''
  const canPrev = safeFrameIndex > 0
  const canNext = safeFrameIndex < previewFrames.length - 1
  const reelPricePesos = previewFrames.length * pricePerFramePesos
  /** Prefer client-side duration/words (no server); fall back to API transcript data. */
  const effectiveDurationSeconds = clipDurationSeconds ?? clipTranscript?.durationSeconds ?? null
  const effectiveMaxWords = clipMaxWords ?? clipTranscript?.maxWordsForNarration ?? null
  const hasCustomScriptStyle =
    scriptStyle.fontScale !== 1 ||
    scriptStyle.bgOpacity !== 180 ||
    (scriptStyle.animationMode ?? 'normal') !== 'normal'

  const filteredVoices = useMemo(() => {
    const q = voiceSearchQuery.trim().toLowerCase()
    if (!q) {
      return voices
    }

    return voices.filter((voice) => (
      voice.name.toLowerCase().includes(q) ||
      voice.id.toLowerCase().includes(q) ||
      (voice.country ?? '').toLowerCase().includes(q) ||
      (voice.language ?? '').toLowerCase().includes(q)
    ))
  }, [voiceSearchQuery, voices])

  function getVoiceOptionId(voice: VoiceOption): string {
    return `order-voice-option-${voice.engine}-${voice.id.replace(/[^a-z0-9_-]/gi, '-')}`
  }

  function selectVoiceOption(voice: VoiceOption): void {
    setVoiceEngine(voice.engine)
    setVoiceName(voice.id)
    setVoiceSearchQuery('')
    setVoiceSearchOpen(false)
    setVoiceHighlightIndex(-1)
    voiceSearchInputRef.current?.blur()
  }

  useEffect(() => {
    if (!voiceSearchOpen) {
      setVoiceHighlightIndex(-1)
      return
    }

    if (filteredVoices.length === 0) {
      setVoiceHighlightIndex(-1)
      return
    }

    setVoiceHighlightIndex((current) => {
      if (current >= 0 && current < filteredVoices.length) {
        return current
      }

      const selectedIndex = filteredVoices.findIndex((voice) =>
        voice.engine === voiceEngine && voice.id === voiceName,
      )

      return selectedIndex >= 0 ? selectedIndex : 0
    })
  }, [filteredVoices, voiceName, voiceEngine, voiceSearchOpen])

  useEffect(() => {
    scriptValueRef.current = script
  }, [script])

  useEffect(() => {
    setProceedOverWordLimit(isImpersonating)
  }, [isImpersonating])

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/reels/fonts`).then((r) => r.ok ? r.json() : { items: [], defaultFont: 'default' }),
      fetch(`${API}/api/clips`).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/api/reels/voices`).then((r) => r.ok ? r.json() : null),
      fetch(`${API}/api/orders/pricing`).then((r) => r.ok ? r.json() : null),
    ]).then(([fontData, clipList, voiceData, pricingData]) => {
      const fontItems = Array.isArray((fontData as { items?: FontItem[] })?.items)
        ? (fontData as { items: FontItem[] }).items
        : []
      setFonts(fontItems)
      const defaultFont = (fontData as { defaultFont?: string })?.defaultFont ?? 'default'
      if (!fontId) setFontId(defaultFont)
      setClips(Array.isArray(clipList) ? clipList : [])
      if (pricingData && typeof pricingData.wordsPerFrame === 'number') {
        const byTier = pricingData.pricePerFramePesosByTier
        const pricePerFramePesos =
          typeof pricingData.pricePerFramePesos === 'number'
            ? pricingData.pricePerFramePesos
            : byTier?.ttsOnly ?? 5
        setPricing({
          wordsPerFrame: pricingData.wordsPerFrame,
          pricePerFramePesos,
          pricePerFramePesosByTier: byTier ?? {
            ttsOnly: pricePerFramePesos,
            clipOnly: 5,
            clipAndNarrator: 7,
          },
        })
      }
      const typedVoiceData = voiceData as VoicesRes | null
      if (typedVoiceData) {
        const list: VoiceOption[] = []
        if (typedVoiceData.edge?.length) {
          typedVoiceData.edge.forEach((v) =>
            list.push({
              id: v.id,
              name: v.name,
              engine: 'edge',
              locale: v.locale,
              country: v.country,
              language: v.language,
              gender: v.gender,
              sample_text: v.sample_text,
            })
          )
        }
        if (typedVoiceData.piper?.installed?.length) {
          typedVoiceData.piper.installed.forEach((v) =>
            list.push({ id: v.id, name: v.name, engine: 'piper' })
          )
        }
        if (typedVoiceData.pyttsx3?.length) {
          typedVoiceData.pyttsx3.forEach((v) =>
            list.push({ id: v.id, name: v.name, engine: 'pyttsx3' })
          )
        }
        setVoices(list)
        if (typedVoiceData.defaultVoiceId && !voiceName) {
          setVoiceName(typedVoiceData.defaultVoiceId)
          setVoiceEngine(typedVoiceData.defaultEngine ?? 'edge')
        }
      }
    }).catch(() => setError('Could not load options. Is the API running?'))
  }, [])

  /** Shared validation; returns amountPesos or sets error and returns null. */
  function validateAndGetAmount(): number | null {
    setError('')
    const hasClip = Boolean(clipName)
    const transcriptReady = clipTranscript?.status === 'completed' && Boolean(clipTranscript.text)
    if ((!script.trim() && !hasClip) || !fontId || !voiceName) {
      setError('Please fill in font and voice. Script is required if no clip is uploaded.')
      return null
    }
    if (!script.trim() && hasClip && !transcriptReady) {
      const noSpeech = clipTranscript?.status === 'empty' || clipTranscript?.status === 'failed'
      setError(
        noSpeech
          ? 'No speech was detected in your clip. Enter a script above to continue.'
          : 'Transcript not ready yet. Please wait or enter a script.'
      )
      return null
    }
    const maxWords = clipName && effectiveMaxWords != null ? effectiveMaxWords : null
    if (maxWords != null && script.trim().length > 0) {
      const count = wordCount(script)
      if (count > maxWords && !proceedOverWordLimit) {
        setError(
          `Your script has ${count} words. The video length allows at most ${maxWords} words. Shorten your script to fit, or check the box below to proceed anyway.`
        )
        return null
      }
    }
    const paymentFrames = scriptToFrames(effectiveScript, wordsPerFrame)
    const amountPesos = paymentFrames.length * pricePerFramePesos
    if (amountPesos < 1) {
      setError('Amount must be at least ₱1.')
      return null
    }
    return amountPesos
  }

  /** Build order payload for prepare-checkout (order is created only after payment succeeds). */
  function buildOrderPayload() {
    const hasTitle = Boolean(title.trim())
    const position = hasTitle && scriptPosition === 'center' ? 'bottom' : scriptPosition
    return {
      script: script.trim() || clipTranscript?.text || '',
      title: title.trim() || undefined,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      deliveryAddress: deliveryAddress.trim(),
      outputSize: previewSize,
      fontId,
      clipName: clipName || undefined,
      voiceEngine,
      voiceName,
      scriptPosition: position,
      scriptStyle: hasCustomScriptStyle ? scriptStyle : undefined,
      ...(clipName && {
        useClipAudio: useClipAudio || useClipAudioWithNarrator,
        useClipAudioWithNarrator: useClipAudioWithNarrator || undefined,
      }),
    }
  }

  /** Pay with QRPH: show QR on this page (requires at least ₱20). */
  async function handlePayWithQr(e: React.FormEvent) {
    e.preventDefault()
    if (isImpersonating) return
    const amountPesos = validateAndGetAmount()
    if (amountPesos == null) return
    if (amountPesos < 20) {
      setError('QRPH payment requires at least ₱20.')
      return
    }
    const selectedVoice = voices.find((v) => v.engine === voiceEngine && v.id === voiceName)
    const scriptWords = wordCount(effectiveScript || script)
    const videoLabel = clipName
      ? (uploadedClipUrl ? 'Your uploaded video' : clipName)
      : 'No video (captions only)'
    const audioMode = !clipName
      ? 'Narrator only (no clip audio)'
      : useClipAudioWithNarrator
        ? 'Clip audio + narrator'
        : useClipAudio
          ? 'Clip audio only'
          : 'Narrator only'
    const summaryLines = [
      'Please review your order before paying:',
      '',
      'Payment method: Pay with QRPH (GCash / Maya / bank app)',
      `Total: ₱${amountPesos.toLocaleString()}`,
      `Frames: ${previewFrames.length} × ₱${pricePerFramePesos}`,
      `Script words: ${scriptWords}`,
      `Video: ${videoLabel}`,
      `Narrator: ${selectedVoice ? `${selectedVoice.name} (${selectedVoice.engine})` : `${voiceEngine} / ${voiceName}`}`,
      `Audio mode: ${audioMode}`,
      `Name: ${customerName.trim() || '—'}`,
      `Email: ${customerEmail.trim() || '—'}`,
      `Address: ${deliveryAddress.trim() || '—'}`,
      '',
      'Do you want to proceed and generate a QRPH code for payment?',
    ]
    if (!window.confirm(summaryLines.join('\n'))) return
    setSubmitting(true)
    setError('')
    try {
      const orderPayload = buildOrderPayload()
      setPaymongoOrderId(null)
      setPaymongoPaymentIntentId(null)
      setPaymongoQrExpiresAt(null)
      setQrSecondsLeft(null)
      setQrPaymentConfirmed(false)
      setQrPaymentStatusMessage('Waiting for payment confirmation…')
      const res = await fetch(`${API}/api/orders/paymongo-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountPesos, orderPayload }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { message?: string }).message || 'QRPH payment failed')
      }
      const data = (await res.json()) as {
        qrImageUrl: string
        amountPesos: number
        paymentIntentId?: string
        qrExpiresAt?: string
      }
      if (data.qrImageUrl) {
        setPaymongoQrImageUrl(data.qrImageUrl)
        setPaymongoAmountPesos(data.amountPesos)
        setPaymongoPaymentIntentId(data.paymentIntentId ?? null)
        const fallbackExpiry = new Date(Date.now() + 15 * 60_000).toISOString()
        setPaymongoQrExpiresAt(data.qrExpiresAt ?? fallbackExpiry)
        return
      }
      throw new Error('No QR image returned')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'QRPH payment failed. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (!paymongoQrImageUrl || !paymongoQrExpiresAt || qrPaymentConfirmed) {
      setQrSecondsLeft(null)
      return
    }

    const expiresAtMs = Date.parse(paymongoQrExpiresAt)
    if (!Number.isFinite(expiresAtMs)) {
      setQrSecondsLeft(null)
      return
    }

    let isActive = true

    const syncCountdown = () => {
      if (!isActive) return
      const remaining = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000))
      setQrSecondsLeft(remaining)
    }

    syncCountdown()
    const timer = window.setInterval(syncCountdown, 1000)

    return () => {
      isActive = false
      window.clearInterval(timer)
    }
  }, [paymongoQrExpiresAt, paymongoQrImageUrl, qrPaymentConfirmed])

  const qrPaymentExpired = !qrPaymentConfirmed && qrSecondsLeft != null && qrSecondsLeft <= 0
  const qrStatusText = qrPaymentExpired
    ? 'QR code expired. Please go back and generate a new QR code.'
    : qrPaymentStatusMessage

  useEffect(() => {
    if (!paymongoQrImageUrl || !paymongoPaymentIntentId) return
    let active = true
    let timer: ReturnType<typeof window.setInterval> | null = null

    const checkPayment = async () => {
      try {
        const pingUrl = `${API}/api/orders/payment-ping/${encodeURIComponent(paymongoPaymentIntentId)}`

        const res = await fetch(pingUrl)
        if (!res.ok || !active) return
        const paymentPing = (await res.json()) as {
          isPaid?: boolean
          paymentStatus?: string
          paymongoStatus?: string | null
          orderId?: string | null
        }

        if (paymentPing.isPaid || paymentPing.paymentStatus === 'confirmed') {
          if (paymentPing.orderId) {
            setPaymongoOrderId(paymentPing.orderId)
            setQrPaymentConfirmed(true)
            setQrPaymentStatusMessage('Payment confirmed. You can now proceed to receipt page.')
            if (timer != null) {
              window.clearInterval(timer)
              timer = null
            }
            return
          }

          setQrPaymentStatusMessage('Payment confirmed. Finalizing your order…')
          return
        }

        if (paymentPing.paymongoStatus === 'awaiting_next_action') {
          setQrPaymentStatusMessage('Waiting for payment. Please complete payment in your app.')
          return
        }

        if (paymentPing.paymongoStatus === 'processing') {
          setQrPaymentStatusMessage('Payment is processing. Waiting for confirmation…')
          return
        }

        if (paymentPing.paymongoStatus === 'failed') {
          setQrPaymentStatusMessage('Payment failed. Please go back and generate a new QR code.')
          return
        }

        if (paymentPing.paymongoStatus === 'canceled') {
          setQrPaymentStatusMessage('Payment was cancelled. Please go back and generate a new QR code.')
          return
        }

        if (paymentPing.paymongoStatus === 'expired') {
          setQrPaymentStatusMessage('QR payment expired. Please go back and generate a new QR code.')
          return
        }
      } catch {
        // keep polling; webhook confirmation can arrive a bit later
      }
    }

    void checkPayment()
    timer = window.setInterval(() => {
      void checkPayment()
    }, 3000)

    return () => {
      active = false
      if (timer != null) {
        window.clearInterval(timer)
      }
    }
  }, [paymongoPaymentIntentId, paymongoQrImageUrl])

  async function handleDownloadQrCode() {
    if (!paymongoQrImageUrl || downloadingQr) return
    setDownloadingQr(true)
    try {
      const res = await fetch(paymongoQrImageUrl)
      if (!res.ok) {
        throw new Error('Failed to download QR code image')
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const suffix = paymongoPaymentIntentId?.slice(-8) ?? String(Date.now())
      anchor.href = objectUrl
      anchor.download = `qrph-payment-${suffix}.png`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      window.open(paymongoQrImageUrl, '_blank', 'noopener,noreferrer')
    } finally {
      setDownloadingQr(false)
    }
  }

  function handleJoyrideCallback(data: { status?: string }) {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      setRunTour(false)
      try {
        localStorage.setItem(ORDER_TOUR_STORAGE_KEY, '1')
      } catch {
        // ignore
      }
    }
  }

  function handleClipSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value
    setClipName(value)
    setUploadedClipUrl(null)
    setClipTranscript(null)
    setClipDurationSeconds(null)
    setClipMaxWords(null)
  }

  async function handleClipUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setClipDurationSeconds(null)
    setClipMaxWords(null)
    const durationSeconds = await getVideoDurationInBrowser(file)
    if (durationSeconds != null) {
      setClipDurationSeconds(durationSeconds)
      setClipMaxWords(maxWordsForDuration(durationSeconds))
    }
    setUploadingClip(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const r = await fetch(`${API}/api/orders/upload-clip`, { method: 'POST', body: formData })
      if (!r.ok) throw new Error('Upload failed')
      const data = await r.json()
      if (!data?.name || !data?.url) throw new Error('Invalid response')
      setClipName(data.name)
      setUploadedClipUrl(data.url.startsWith('http') ? data.url : `${API}${data.url}`)
      setClipTranscript(null)
    } catch {
      setError('Video upload failed. Use a supported format (e.g. MP4, WebM).')
      setClipDurationSeconds(null)
      setClipMaxWords(null)
    } finally {
      setUploadingClip(false)
      e.target.value = ''
    }
  }

  // Restore form when returning from PayMongo (back/cancel): no orderId in URL, use saved draft
  useEffect(() => {
    if (orderIdFromQuery) return
    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(ORDER_FORM_DRAFT_KEY)
    } catch {
      return
    }
    if (!raw) return
    try {
      const draft = JSON.parse(raw) as OrderFormDraft
      setScript(draft.script ?? '')
      setTitle(draft.title ?? '')
      setFontId(draft.fontId ?? '')
      setClipName(draft.clipName ?? '')
      setVoiceEngine(draft.voiceEngine ?? 'edge')
      setVoiceName(draft.voiceName ?? '')
      setUseClipAudio(Boolean(draft.useClipAudio))
      setUseClipAudioWithNarrator(Boolean(draft.useClipAudioWithNarrator))
      if (draft.scriptPosition && ['top', 'center', 'bottom'].includes(draft.scriptPosition)) {
        setScriptPosition(draft.scriptPosition)
      }
      if (
        draft.scriptStyle &&
        (
          typeof draft.scriptStyle.fontScale === 'number' ||
          typeof draft.scriptStyle.bgOpacity === 'number' ||
          typeof draft.scriptStyle.animationMode === 'string'
        )
      ) {
        setScriptStyle({
          fontScale: draft.scriptStyle.fontScale ?? 1,
          bgOpacity: draft.scriptStyle.bgOpacity ?? 180,
          animationMode: normalizeCaptionAnimationMode(draft.scriptStyle.animationMode),
        })
      }
      if (draft.previewSize && ['phone', 'tablet', 'laptop', 'desktop'].includes(draft.previewSize)) {
        setPreviewSize(draft.previewSize)
      }
      setCustomerName(draft.customerName ?? '')
      setCustomerEmail(draft.customerEmail ?? '')
      setDeliveryAddress(draft.deliveryAddress ?? '')
      if (draft.uploadedClipUrl) {
        setUploadedClipUrl(draft.uploadedClipUrl)
      }
      if (draft.clipName) {
        scriptFilledForClipRef.current = draft.clipName
      }
      sessionStorage.removeItem(ORDER_FORM_DRAFT_KEY)
    } catch {
      try {
        sessionStorage.removeItem(ORDER_FORM_DRAFT_KEY)
      } catch {
        // ignore
      }
    }
  }, [orderIdFromQuery])

  // Restore form when returning from PayMongo (cancel) with ?orderId=xxx
  useEffect(() => {
    const id = orderIdFromQuery
    if (!id) return
    fetch(`${API}/api/orders/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((order: OrderSnapshot | null) => {
        if (!order) return
        setImpersonatedOriginalOrder(isImpersonating ? order : null)
        setOrderId(order.id)
        setScript(order.script ?? '')
        scriptValueRef.current = order.script ?? ''
        setTitle(order.title ?? '')
        setCustomerName(order.customerName ?? '')
        setCustomerEmail(order.customerEmail ?? '')
        setDeliveryAddress(order.deliveryAddress ?? '')
        setFontId(order.fontId ?? '')
        setVoiceEngine(order.voiceEngine ?? 'edge')
        setVoiceName(order.voiceName ?? '')
        if (['phone', 'tablet', 'laptop', 'desktop'].includes(order.outputSize ?? '')) {
          setPreviewSize(order.outputSize as PreviewSize)
        }
        if (order.clipName) {
          setClipName(order.clipName)
          scriptFilledForClipRef.current = (order.script ?? '').trim()
            ? order.clipName
            : null
          setClipDurationSeconds(null)
          setClipMaxWords(null)
          if (order.clipName.startsWith('order-')) {
            setUploadedClipUrl(`${API}/media/order-clips/${encodeURIComponent(order.clipName)}`)
          }
        } else {
          scriptFilledForClipRef.current = null
          setClipDurationSeconds(null)
          setClipMaxWords(null)
        }
        setUseClipAudio(Boolean(order.useClipAudio))
        setUseClipAudioWithNarrator(Boolean(order.useClipAudioWithNarrator))
        if (order.scriptPosition && ['top', 'center', 'bottom'].includes(order.scriptPosition)) {
          setScriptPosition(order.scriptPosition)
        }
        const style = order.scriptStyle
        if (
          style &&
          (
            typeof style.fontScale === 'number' ||
            typeof style.bgOpacity === 'number' ||
            typeof style.animationMode === 'string'
          )
        ) {
          setScriptStyle({
            fontScale: style.fontScale ?? 1,
            bgOpacity: style.bgOpacity ?? 180,
            animationMode: normalizeCaptionAnimationMode(style.animationMode),
          })
        }
        if (!isImpersonating) {
          setSearchParams({}, { replace: true })
        }
      })
      .catch(() => {
        if (isImpersonating) setImpersonatedOriginalOrder(null)
      })
  }, [isImpersonating, orderIdFromQuery, setSearchParams])

  // When we have an uploaded clip URL but no client duration yet (e.g. loaded from order), get duration from the video in the browser
  useEffect(() => {
    if (!uploadedClipUrl || clipDurationSeconds != null) return
    let isCancelled = false
    getVideoDurationInBrowser(uploadedClipUrl).then((d) => {
      if (!isCancelled && d != null) {
        setClipDurationSeconds(d)
        setClipMaxWords(maxWordsForDuration(d))
      }
    })
    return () => { isCancelled = true }
  }, [uploadedClipUrl, clipDurationSeconds])

  useEffect(() => {
    if (!clipName || !clipName.startsWith('order-')) {
      setClipTranscript(null)
      return
    }
    let isCancelled = false
    const fetchTranscript = async () => {
      try {
        const res = await fetch(`${API}/api/order-clips/${encodeURIComponent(clipName)}/transcript`)
        if (!res.ok) return
        const data = (await res.json()) as ClipTranscriptInfo
        if (!isCancelled) {
          setClipTranscript(data)
          if (data?.status === 'completed' && data?.text && scriptFilledForClipRef.current !== clipName) {
            if (!scriptValueRef.current.trim()) {
              setScript(data.text)
              scriptValueRef.current = data.text
            }
            scriptFilledForClipRef.current = clipName
          }
        }
      } catch {
        //
      }
    }
    void fetchTranscript()
    const interval = window.setInterval(fetchTranscript, 4000)
    return () => {
      isCancelled = true
      window.clearInterval(interval)
    }
  }, [clipName])

  async function handleSaveForCustomer(e: React.FormEvent) {
    e.preventDefault()
    if (!isImpersonating) return
    const amountPesos = validateAndGetAmount()
    if (amountPesos == null) return
    if (!orderId) {
      setError('Unable to save this order yet. Please wait for the order to load.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const payload = buildOrderPayload()
      const res = await fetch(`${API}/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { message?: string }).message || 'Failed to save order')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save order for the customer.')
    } finally {
      setSubmitting(false)
    }
  }

  const transcriptDone =
    clipTranscript != null &&
    (clipTranscript.status === 'completed' || clipTranscript.status === 'empty' || clipTranscript.status === 'failed')
  const transcriptPending =
    Boolean(clipName?.startsWith('order-')) &&
    (clipTranscript == null || !transcriptDone)
  const showOverlay = uploadingClip || transcriptPending || submitting
  const overlayMessage = uploadingClip
    ? 'Uploading video…'
    : transcriptPending
      ? 'Transcribing your clip…'
      : isImpersonating
        ? 'Saving order…'
        : 'Generating QRPH code…'

  const isTestMode = (import.meta.env.VITE_APP_ENV ?? '') !== 'production'

  if (paymongoQrImageUrl && paymongoAmountPesos != null) {
    return (
      <div className="container order-page">
        <div className="card payment-qr-card">
          {isTestMode && (
            <p className="payment-qr-test-badge" role="status">Test mode — no real charge when you scan.</p>
          )}
          <h1 className="payment-qr-title">Scan to pay</h1>
          <p className="payment-qr-amount" aria-label={`Amount: ${paymongoAmountPesos} pesos`}>
            Amount: <strong>₱{paymongoAmountPesos.toLocaleString()}</strong>
          </p>
          <p className="payment-qr-hint">
            Scan the QRPH code with GCash, Maya, or your bank app to complete payment.
          </p>
          <p className="payment-qr-hint" role="status" aria-live="polite">
            {qrStatusText}
          </p>
          {!qrPaymentConfirmed && qrSecondsLeft != null && (
            <p
              className={`payment-qr-expiry${qrPaymentExpired ? ' payment-qr-expiry-expired' : ''}`}
              role="status"
              aria-live="polite"
            >
              {qrPaymentExpired ? 'Expired' : `QR expires in ${formatCountdown(qrSecondsLeft)}`}
            </p>
          )}
          <div className="payment-qr-main">
            <div className="payment-qr-wrap">
              <img
                src={paymongoQrImageUrl}
                alt="QRPH code: scan to pay with GCash, Maya, or bank app"
                className={`payment-qr-image${qrPaymentExpired ? ' payment-qr-image-expired' : ''}`}
                width={280}
                height={280}
              />
              {qrPaymentExpired ? <div className="payment-qr-expired-overlay">Expired</div> : null}
            </div>
            <section className="payment-qr-mobile-guide" aria-label="How to pay on mobile">
              <p className="payment-qr-mobile-guide-title">How to pay on mobile</p>
              <ol className="payment-qr-mobile-guide-list">
                <li>Download or screenshot this QR code.</li>
                <li>Open GCash, Maya, or your bank app on your phone.</li>
                <li>Tap Scan/QR and choose the saved image from your gallery.</li>
                <li>Confirm the amount and complete the payment.</li>
              </ol>
            </section>
          </div>
          <div className="payment-qr-actions">
            <button
              type="button"
              className="btn payment-qr-btn-download"
              onClick={() => {
                void handleDownloadQrCode()
              }}
              disabled={downloadingQr || !paymongoQrImageUrl}
            >
              {downloadingQr ? 'Preparing download…' : 'Download QR code'}
            </button>
            {paymongoOrderId && qrPaymentConfirmed && (
              <button
                type="button"
                className="btn order-form-submit-btn payment-qr-btn-receipt"
                onClick={() => navigate(`/receipt/${encodeURIComponent(paymongoOrderId)}`)}
              >
                Proceed to receipt page
              </button>
            )}
            <button
              type="button"
              className="btn payment-qr-btn-back"
              onClick={() => {
                setPaymongoQrImageUrl(null)
                setPaymongoAmountPesos(null)
                setPaymongoOrderId(null)
                setPaymongoPaymentIntentId(null)
                setPaymongoQrExpiresAt(null)
                setQrSecondsLeft(null)
                setQrPaymentConfirmed(false)
                setQrPaymentStatusMessage('Waiting for payment confirmation…')
                setDownloadingQr(false)
              }}
            >
              Back to order
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container order-page">
      {!paymongoQrImageUrl && (
        <Joyride
          steps={ORDER_FORM_STEPS}
          run={runTour}
          callback={handleJoyrideCallback}
          continuous
          showProgress
          showSkipButton
          scrollToFirstStep
          scrollOffset={80}
          spotlightPadding={8}
          styles={{
            options: {
              primaryColor: 'var(--accent, #14bd63)',
              zIndex: 10000,
            },
          }}
        />
      )}
      {showOverlay && (
        <div className="order-page-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="order-page-overlay-content">
            <div className="order-page-overlay-spinner" />
            <p className="order-page-overlay-message">{overlayMessage}</p>
          </div>
        </div>
      )}
      <div className="card">
        <header className="order-page-hero">
          <h1>Place your order</h1>
          <p>Pick a clip, font, and voice. If your video has speech, we can auto-generate the script.</p>
          <button
            type="button"
            className="order-tour-trigger"
            onClick={() => setRunTour(true)}
            aria-label="Start a short guided tour of the order form"
          >
            <span aria-hidden>▶</span> Take a tour
          </button>
        </header>
        {error ? (
          <p className="order-form-error" id="order-form-error" role="alert" aria-live="assertive">
            {error}
          </p>
        ) : null}

        {isImpersonating && impersonatedOriginalOrder && (
          <ImpersonationAlert orderId={impersonatedOriginalOrder.id} />
        )}

        <>
          <style>{fonts.filter((f) => isCustomFontFile(f.id)).map((f) => `
              @font-face {
                font-family: "OrderFont-${f.id.replace(/[^a-z0-9.-]/gi, '_')}";
                src: url("${API}/media/fonts/${encodeURIComponent(f.id)}");
              }
            `).join('')}</style>
          <div className="order-page-layout">
            <form
              onSubmit={(e) => e.preventDefault()}
              className="order-form-column"
              aria-describedby={error ? 'order-form-error' : undefined}
            >
              {/* 1. Upload — video only */}
              <section className="order-form-step order-section-upload" aria-labelledby="order-step-upload-heading">
                <h2 id="order-step-upload-heading" className="order-form-step-title">Upload</h2>
                <p className="order-form-step-intro">Background video (optional). Upload your own or choose from our clips. None = captions only.</p>
                <div className="field">
                  <div className="upload-own-video">
                    <p className="upload-own-video-heading">Upload your own video</p>
                    <label className="upload-label">
                      <input
                        type="file"
                        accept=".mp4,.mov,.mkv,.webm,.avi,video/*"
                        onChange={handleClipUpload}
                        disabled={uploadingClip}
                      />
                      {uploadingClip ? 'Uploading…' : 'Choose file'}
                    </label>
                    {uploadedClipUrl && (
                      <button
                        type="button"
                        className="link-style"
                        onClick={() => { setClipName(''); setUploadedClipUrl(null) }}
                      >
                        Remove uploaded video
                      </button>
                    )}
                  </div>
                  <p className="field-hint" style={{ marginTop: '0.5rem' }}>Or choose from our videos:</p>
                  <select id="order-clip" value={clipName} onChange={handleClipSelect} aria-label="Background video">
                    <option value="">None — caption style only</option>
                    {uploadedClipUrl && clipName && (
                      <option value={clipName}>Your uploaded video</option>
                    )}
                    {clips.map((c) => (
                      <option key={c.name} value={c.name}>{c.displayName ?? c.name}</option>
                    ))}
                  </select>
                  {clipName && (
                    <p className="uploaded-video-duration" aria-live="polite">
                      {effectiveDurationSeconds != null ? (
                        <>
                          Video duration: <strong>{formatDuration(effectiveDurationSeconds)}</strong>
                          {effectiveMaxWords != null && (
                            <> · Max script: <strong>{effectiveMaxWords} words</strong></>
                          )}
                        </>
                      ) : transcriptPending ? (
                        <>Detecting video duration…</>
                      ) : (
                        <>Duration unavailable for this video.</>
                      )}
                    </p>
                  )}
                  {clipName && (
                    <div className="field audio-tier-cards-wrap" role="group" aria-label="How should your video sound?">
                      <span className="label audio-tier-cards-label">How should your video sound?</span>
                      <p className="audio-tier-cards-hint">Choose one. Price varies by option.</p>
                      <div className="audio-tier-cards">
                        <label className={`audio-tier-card ${!useClipAudio && !useClipAudioWithNarrator ? 'audio-tier-card-selected' : ''}`}>
                          <input
                            type="radio"
                            name="clipAudioOption"
                            value=""
                            checked={!useClipAudio && !useClipAudioWithNarrator}
                            onChange={() => {
                              setUseClipAudio(false)
                              setUseClipAudioWithNarrator(false)
                            }}
                            className="audio-tier-card-input"
                          />
                          <span className="audio-tier-card-title">Only a voice (no sound from my video)</span>
                          <span className="audio-tier-card-desc">We turn off your video&apos;s sound. A voice reads your words. That&apos;s it.</span>
                          <span className="audio-tier-card-price">₱{tiers.ttsOnly} per frame</span>
                        </label>
                        <label className={`audio-tier-card ${useClipAudio && !useClipAudioWithNarrator ? 'audio-tier-card-selected' : ''}`}>
                          <input
                            type="radio"
                            name="clipAudioOption"
                            value="no_narrator"
                            checked={useClipAudio && !useClipAudioWithNarrator}
                            onChange={() => {
                              setUseClipAudio(true)
                              setUseClipAudioWithNarrator(false)
                            }}
                            className="audio-tier-card-input"
                          />
                          <span className="audio-tier-card-title">Only my video&apos;s sound (no extra voice)</span>
                          <span className="audio-tier-card-desc">We keep the sound from your video. We put your words on screen as text. No one else talks.</span>
                          <span className="audio-tier-card-price">₱{tiers.clipOnly} per frame</span>
                        </label>
                        <label className={`audio-tier-card ${useClipAudioWithNarrator ? 'audio-tier-card-selected' : ''}`}>
                          <input
                            type="radio"
                            name="clipAudioOption"
                            value="with_narrator"
                            checked={useClipAudioWithNarrator}
                            onChange={() => {
                              setUseClipAudio(true)
                              setUseClipAudioWithNarrator(true)
                            }}
                            className="audio-tier-card-input"
                          />
                          <span className="audio-tier-card-title">My video&apos;s sound + a voice reading my words</span>
                          <span className="audio-tier-card-desc">We keep your video&apos;s sound and add a voice that reads your words. Words also show on screen.</span>
                          <span className="audio-tier-card-price">₱{tiers.clipAndNarrator} per frame</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* 2. Look — font, screen size, caption position, caption style */}
              <section className="order-form-step" aria-labelledby="order-step-style-heading">
                <h2 id="order-step-style-heading" className="order-form-step-title">Look</h2>
                <p className="order-form-step-intro">Font, output size, and caption position and style.</p>
                <div className="field">
                  <label className="label" htmlFor="order-font">Font</label>
                  <select
                    id="order-font"
                    value={fontId}
                    onChange={(e) => setFontId(e.target.value)}
                    required
                    style={{ fontFamily: fontFamilyFor(fontId) }}
                    className="font-select-options"
                  >
                    {fonts.length === 0 && (
                      <>
                        <option value="">Loading…</option>
                        <option value="default">System default</option>
                      </>
                    )}
                    {fonts.map((f) => (
                      <option key={f.id} value={f.id} style={{ fontFamily: fontFamilyFor(f.id) }}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label" htmlFor="order-preview-size">Screen size (output)</label>
                  <select
                    id="order-preview-size"
                    className="order-preview-size-select order-form-control"
                    value={previewSize}
                    onChange={(e) => setPreviewSize(e.target.value as PreviewSize)}
                    aria-label="Video output screen size"
                  >
                    {PREVIEW_SIZES.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  <p className="field-hint">
                    Your video will be delivered in <strong>{PREVIEW_SIZES.find((s) => s.id === previewSize)?.label ?? previewSize}</strong> format.
                  </p>
                </div>
                <div className="field order-script-position-row">
                  <label htmlFor="order-script-position" className="order-field-label">Caption position</label>
                  <select
                    id="order-script-position"
                    className="order-script-position-select order-form-control"
                    value={scriptPosition}
                    onChange={(e) => setScriptPosition(e.target.value as 'top' | 'center' | 'bottom')}
                    aria-label="Where captions appear on the video"
                  >
                    <option value="top">Top</option>
                    {!title.trim() && <option value="center">Center</option>}
                    <option value="bottom">Bottom</option>
                  </select>
                  {title.trim() && (
                    <p className="order-script-position-hint muted small">Center is available when no title is set.</p>
                  )}
                </div>
                <div className="field order-script-style-row">
                  <span className="order-field-label">Caption style</span>
                  <div className="order-script-style-controls">
                    <label className="order-script-style-label">
                      Font size
                      <select
                        className="order-script-style-select order-form-control"
                        value={String(scriptStyle.fontScale ?? 1)}
                        onChange={(e) => setScriptStyle((s) => ({ ...s, fontScale: Number(e.target.value) }))}
                        aria-label="Caption font size"
                      >
                        <option value="0.8">Small</option>
                        <option value="1">Medium</option>
                        <option value="1.2">Large</option>
                      </select>
                    </label>
                    <label className="order-script-style-label">
                      Background
                      <select
                        className="order-script-style-select order-form-control"
                        value={String(scriptStyle.bgOpacity ?? 180)}
                        onChange={(e) => setScriptStyle((s) => ({ ...s, bgOpacity: Number(e.target.value) }))}
                        aria-label="Caption background opacity"
                      >
                        <option value="120">Light</option>
                        <option value="180">Medium</option>
                        <option value="220">Dark</option>
                      </select>
                    </label>
                    <label className="order-script-style-label">
                      Animation
                      <select
                        className="order-script-style-select order-form-control"
                        value={scriptStyle.animationMode ?? 'normal'}
                        onChange={(e) =>
                          setScriptStyle((s) => ({
                            ...s,
                            animationMode: normalizeCaptionAnimationMode(e.target.value),
                          }))
                        }
                        aria-label="Caption animation mode"
                      >
                        <option value="calming">Calming</option>
                        <option value="normal">Normal</option>
                        <option value="extreme">Extreme</option>
                      </select>
                    </label>
                  </div>
                </div>
              </section>

              {/* 3. Content — script and title */}
              <section className="order-form-step" aria-labelledby="order-step-content-heading">
                <h2 id="order-step-content-heading" className="order-form-step-title">Content</h2>
                <p className="order-form-step-intro">Script and optional title.</p>
                <div className="field">
                  <label className="label" htmlFor="order-script">Script</label>
                  <p className="field-hint field-hint-above">Paste or type your script. If you add a video above, we can transcribe it for you.</p>
                  {clipName && effectiveMaxWords != null && (
                    <>
                      <p
                        className={`script-allowed-words${wordCount(script) > effectiveMaxWords ? ' script-over-limit' : ''}`}
                        aria-live="polite"
                      >
                        Suggested word length for this video: <strong>{effectiveMaxWords}</strong>
                        {script.trim().length > 0 && (
                          <> — {wordCount(script)} / {effectiveMaxWords} words</>
                        )}
                      </p>
                      {wordCount(script) > effectiveMaxWords && (
                        <label className="script-over-limit-checkbox">
                          <input
                            type="checkbox"
                            checked={proceedOverWordLimit}
                            onChange={(e) => setProceedOverWordLimit(e.target.checked)}
                            aria-describedby="order-script"
                          />
                          <span>I understand my script is longer than recommended for this video length, and I’d like to proceed anyway.</span>
                        </label>
                      )}
                    </>
                  )}
                  <textarea
                    id="order-script"
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    placeholder="e.g. Welcome to our channel. Today we're talking about…"
                    rows={3}
                  />
                  {clipName && clipTranscript?.status && (
                    <p className="field-hint">
                      {clipTranscript.status === 'empty' || clipTranscript.status === 'failed' ? (
                        <>
                          No human speech detected. You can write your own script above.
                          {effectiveMaxWords != null ? (
                            <> Keep it to <strong>{effectiveMaxWords} words</strong> or fewer so the script fits the video length.</>
                          ) : (
                            <> Enter your script above to continue.</>
                          )}
                        </>
                      ) : (
                        <>
                          Transcript: {clipTranscript.status}
                          {transcriptLanguage
                            ? ` · ${transcriptLanguage}${transcriptConfidence !== null ? ` (${transcriptConfidence}%)` : ''}`
                            : ''}
                          {clipTranscript.error ? ` · ${clipTranscript.error}` : ''}
                        </>
                      )}
                    </p>
                  )}
                  {clipName && effectiveDurationSeconds != null && effectiveMaxWords != null && (
                    <p className="field-hint clip-duration-hint">
                      Video length: <strong>{formatDuration(effectiveDurationSeconds)}</strong>. Script must be at most <strong>{effectiveMaxWords} words</strong> to fit the video.
                    </p>
                  )}
                </div>
                <div className="field">
                  <label className="label" htmlFor="order-title">Title (optional)</label>
                  <input
                    id="order-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Tips for beginners"
                  />
                </div>
              </section>

              <section className="order-form-step" aria-labelledby="order-step-voice-heading">
                <h2 id="order-step-voice-heading" className="order-form-step-title">Voice</h2>
                <p className="order-form-step-intro">Narrator voice (or video sound only above).</p>
                <div className="field" ref={voicePickerRef}>
                  <label className="label" htmlFor="order-voice">Narrator voice</label>
                  {(() => {
                    const selectedVoice = voices.find((v) => v.engine === voiceEngine && v.id === voiceName)
                    const displayValue = voiceSearchOpen
                      ? voiceSearchQuery
                      : selectedVoice
                        ? [localeToFlag(selectedVoice.locale), selectedVoice.name, selectedVoice.country, selectedVoice.gender].filter(Boolean).join(' ')
                        : voiceName || 'Select voice…'
                    return (
                      <div
                        className="order-form-control order-voice-picker"
                        style={{
                          position: 'relative',
                          minHeight: '2.5rem',
                          display: 'flex',
                          alignItems: 'center',
                          border: '1px solid var(--color-border, #ccc)',
                          borderRadius: '6px',
                          background: 'var(--input-bg, #fff)',
                        }}
                      >
                        <input
                          id="order-voice"
                          type="text"
                          role="combobox"
                          aria-expanded={voiceSearchOpen}
                          aria-autocomplete="list"
                          aria-controls="order-voice-list"
                          aria-activedescendant={
                            voiceSearchOpen && voiceHighlightIndex >= 0 && filteredVoices[voiceHighlightIndex]
                              ? getVoiceOptionId(filteredVoices[voiceHighlightIndex])
                              : undefined
                          }
                          aria-label="Narrator voice (search by name, country, or language)"
                          value={displayValue}
                          onChange={(e) => {
                            setVoiceSearchQuery(e.target.value)
                            setVoiceSearchOpen(true)
                          }}
                          onFocus={() => {
                            setVoiceSearchOpen(true)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault()
                              if (!voiceSearchOpen) {
                                setVoiceSearchOpen(true)
                              }
                              setVoiceHighlightIndex((current) => {
                                if (filteredVoices.length === 0) {
                                  return -1
                                }
                                if (current < 0) {
                                  return 0
                                }
                                return Math.min(filteredVoices.length - 1, current + 1)
                              })
                              return
                            }

                            if (e.key === 'ArrowUp') {
                              e.preventDefault()
                              if (!voiceSearchOpen) {
                                setVoiceSearchOpen(true)
                              }
                              setVoiceHighlightIndex((current) => {
                                if (filteredVoices.length === 0) {
                                  return -1
                                }
                                if (current < 0) {
                                  return 0
                                }
                                return Math.max(0, current - 1)
                              })
                              return
                            }

                            if (e.key === 'Enter' && voiceSearchOpen && voiceHighlightIndex >= 0) {
                              const highlighted = filteredVoices[voiceHighlightIndex]
                              if (highlighted) {
                                e.preventDefault()
                                selectVoiceOption(highlighted)
                                return
                              }
                            }

                            if (e.key === 'Escape') {
                              setVoiceSearchOpen(false)
                              setVoiceSearchQuery('')
                              setVoiceHighlightIndex(-1)
                              voiceSearchInputRef.current?.blur()
                            }
                          }}
                          ref={voiceSearchInputRef}
                          required={!voiceName}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: '0.5rem 0.75rem',
                            border: 'none',
                            background: 'transparent',
                            fontSize: 'inherit',
                          }}
                        />
                        <ul
                          id="order-voice-list"
                          role="listbox"
                          style={{
                            display: voiceSearchOpen ? 'block' : 'none',
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            margin: 0,
                            marginTop: 2,
                            padding: 0,
                            listStyle: 'none',
                            maxHeight: '16rem',
                            overflowY: 'auto',
                            border: '1px solid var(--color-border, #ccc)',
                            borderRadius: '6px',
                            background: 'var(--input-bg, #fff)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            zIndex: 10,
                          }}
                        >
                          {filteredVoices.length === 0 ? (
                            <li
                              role="option"
                              aria-disabled="true"
                              style={{
                                padding: '0.5rem 0.75rem',
                                color: 'var(--color-muted, #666)',
                              }}
                            >
                              No voice found.
                            </li>
                          ) : filteredVoices.map((v, index) => {
                            const selected = v.engine === voiceEngine && v.id === voiceName
                            const optionId = getVoiceOptionId(v)
                            const isHighlighted = voiceHighlightIndex === index
                            return (
                              <li
                                key={v.engine + v.id}
                                id={optionId}
                                role="option"
                                aria-selected={selected}
                                className={isHighlighted ? 'order-voice-option-highlight' : undefined}
                                style={{
                                  padding: '0.5rem 0.75rem',
                                  cursor: 'pointer',
                                  borderBottom: '1px solid var(--color-border, #eee)',
                                  background: selected
                                    ? 'var(--color-highlight-bg, #e8f4fc)'
                                    : undefined,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  flexWrap: 'wrap',
                                }}
                                onMouseEnter={() => setVoiceHighlightIndex(index)}
                                onClick={() => selectVoiceOption(v)}
                              >
                                <span aria-hidden style={{ fontSize: '1.2em' }}>{localeToFlag(v.locale)}</span>
                                <strong>{v.name}</strong>
                                {v.country != null && v.country !== '' && (
                                  <span style={{ color: 'var(--color-muted, #666)' }}>{v.country}</span>
                                )}
                                {v.language != null && v.language !== '' && (
                                  <span style={{ color: 'var(--color-muted, #666)' }}>{v.language}</span>
                                )}
                                {v.gender != null && v.gender !== '' && (
                                  <span style={{ color: 'var(--color-muted, #666)', textTransform: 'capitalize' }}>{v.gender}</span>
                                )}
                                {v.engine !== 'edge' && (
                                  <span style={{ fontSize: '0.85em', color: 'var(--color-muted, #666)' }}>({v.engine})</span>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )
                  })()}
                </div>
                {(() => {
                  const narratorUsed = !useClipAudio || useClipAudioWithNarrator
                  const canPreviewVoice = narratorUsed && voiceName && voiceEngine === 'edge'
                  if (!canPreviewVoice) return null
                  const previewText = script.trim().slice(0, 500)
                  const previewLabel = previewText
                    ? 'Preview script with this voice'
                    : 'Play sample'
                  return (
                    <div className="field" style={{ marginTop: '0.5rem' }}>
                      <button
                        type="button"
                        className="order-form-control"
                        disabled={voicePreviewLoading}
                        onClick={async () => {
                          if (voicePreviewAudioRef.current) {
                            voicePreviewAudioRef.current.pause()
                            voicePreviewAudioRef.current = null
                          }
                          setVoicePreviewLoading(true)
                          try {
                            const params = new URLSearchParams({
                              voiceId: voiceName,
                            })
                            const textToPreview = script.trim().slice(0, 500)
                            if (textToPreview) params.set('text', textToPreview)
                            const res = await fetch(
                              `${API}/api/reels/voice-preview?${params.toString()}`
                            )
                            if (!res.ok) return
                            const blob = await res.blob()
                            const url = URL.createObjectURL(blob)
                            const audio = new Audio(url)
                            voicePreviewAudioRef.current = audio
                            audio.onended = () => {
                              URL.revokeObjectURL(url)
                              voicePreviewAudioRef.current = null
                              setVoicePreviewLoading(false)
                            }
                            audio.onerror = () => {
                              URL.revokeObjectURL(url)
                              voicePreviewAudioRef.current = null
                              setVoicePreviewLoading(false)
                            }
                            await audio.play()
                          } catch {
                            setVoicePreviewLoading(false)
                          }
                        }}
                      >
                        {voicePreviewLoading ? 'Loading…' : previewLabel}
                      </button>
                    </div>
                  )
                })()}
              </section>

              <section className="order-form-step" aria-labelledby="order-step-details-heading">
                <h2 id="order-step-details-heading" className="order-form-step-title">Your details</h2>
                <p className="order-form-step-intro">Optional; prefilled on payment.</p>
                <div className="order-details-row">
                  <div className="field">
                    <label className="label" htmlFor="order-customer-name">Name</label>
                    <input
                      id="order-customer-name"
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Juan Dela Cruz"
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="order-customer-email">Email</label>
                    <input
                      id="order-customer-email"
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="e.g. juan@example.com"
                    />
                  </div>
                </div>
                <div className="field">
                  <label className="label" htmlFor="order-delivery-address">Address</label>
                  <textarea
                    id="order-delivery-address"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="e.g. City, Province (for delivery or receipt)"
                    rows={2}
                  />
                </div>
              </section>

              <div className="order-form-submit" id="order-form-submit-wrap">
                <div className="order-form-payment-buttons">
                  {isImpersonating ? (
                    <button
                      type="button"
                      id="order-form-submit-btn"
                      className="btn order-form-submit-btn"
                      disabled={submitting || !orderId}
                      onClick={handleSaveForCustomer}
                    >
                      {submitting ? 'Saving…' : 'Save this order for the customer'}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        id="order-form-submit-btn"
                        className="btn order-form-submit-btn"
                        disabled={submitting}
                        onClick={handlePayWithQr}
                      >
                        {submitting ? 'Generating QRPH…' : 'Pay with QRPH'}
                      </button>
                    </>
                  )}
                </div>
                <p className="order-form-submit-hint">
                  {isImpersonating
                    ? 'Save this order for the customer updates this existing order with your changes.'
                    : 'Pay with QRPH shows a code to scan (GCash, Maya, bank app; min ₱20).'}
                </p>
              </div>
            </form>

            {/* 4. Live preview — frame and metadata only */}
            <aside className="order-preview-column" aria-label="Live preview">
              <h2 className="order-preview-label">Live preview</h2>
              <p className="order-preview-clip-name">
                {clipName
                  ? (uploadedClipUrl ? 'Your uploaded video' : clipName)
                  : 'Caption style (no clip)'}
              </p>
              {clipName && effectiveDurationSeconds != null && (
                <p className="order-preview-duration" aria-label={`Video duration ${formatDuration(effectiveDurationSeconds)}`}>
                  Duration: <strong>{formatDuration(effectiveDurationSeconds)}</strong>
                </p>
              )}
              {previewFrames.length > 0 && (
                <p className="order-preview-price">
                  {previewFrames.length} frame{previewFrames.length !== 1 ? 's' : ''} × ₱{pricePerFramePesos} = <strong>₱{reelPricePesos}</strong>
                </p>
              )}
              {clipName && previewFrames.length === 0 && (
                <p className="order-preview-price">
                  {(clipTranscript?.status === 'empty' || clipTranscript?.status === 'failed')
                    ? 'No speech detected. Enter a script above to estimate price.'
                    : 'Transcribing your clip to estimate price…'}
                </p>
              )}
              <div className="order-preview-frame-wrap">
                <div className="order-preview-frame" data-preview-size={previewSize} data-script-position={scriptPosition}>
                  {clipName ? (() => {
                    const catalogClip = clips.find((c) => c.name === clipName)
                    const src = uploadedClipUrl ?? (catalogClip?.url ? `${API}${catalogClip.url}` : null)
                    if (!src) return <div className="preview-caption-bg" />
                    return (
                      <video
                        src={src}
                        muted
                        loop
                        playsInline
                        autoPlay
                        onLoadedMetadata={(e) => {
                          const v = e.currentTarget
                          if (v.videoWidth && v.videoHeight) {
                            setPreviewSize(previewSizeFromDimensions(v.videoWidth, v.videoHeight))
                          }
                        }}
                      />
                    )
                  })() : (
                    <div className="preview-caption-bg" />
                  )}
                  <div
                    className={`order-preview-overlay order-preview-caption-${scriptPosition} order-preview-animation-${scriptStyle.animationMode ?? 'normal'}`}
                    style={{
                      fontFamily: fontFamilyFor(fontId),
                      ['--caption-font-scale' as string]: String(scriptStyle.fontScale ?? 1),
                      ['--caption-bg-opacity' as string]: String(Math.max(0, Math.min(255, scriptStyle.bgOpacity ?? 180)) / 255),
                    }}
                  >
                    <div className="order-preview-title">
                      {title.trim() || 'Your title'}
                    </div>
                    <div className="order-preview-caption" title={currentFrameText || effectiveScript || ''}>
                      {currentFrameText || (clipName ? 'Transcript will appear after upload' : 'Your script will appear here')}
                    </div>
                  </div>
                </div>
                {previewFrames.length > 0 && (
                  <div className="order-preview-nav">
                    <button
                      type="button"
                      className="order-preview-nav-btn"
                      onClick={() => setPreviewFrameIndex((i) => Math.max(0, i - 1))}
                      disabled={!canPrev}
                      aria-label="Previous frame"
                    >
                      ← Prev
                    </button>
                    <span className="order-preview-frame-indicator">
                      Frame {safeFrameIndex + 1} of {previewFrames.length}
                    </span>
                    <button
                      type="button"
                      className="order-preview-nav-btn"
                      onClick={() => setPreviewFrameIndex((i) => Math.min(previewFrames.length - 1, i + 1))}
                      disabled={!canNext}
                      aria-label="Next frame"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </>
      </div>
    </div>
  )
}
