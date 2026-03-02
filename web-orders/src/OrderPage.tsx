import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import Joyride, { type Step } from 'react-joyride'

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3010'

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
interface VoicesRes {
  defaultEngine: string
  defaultVoiceId: string
  edge: Array<{ id: string; name: string }>
  pyttsx3: Array<{ id: string; name: string }>
  piper: { installed: Array<{ id: string; name: string }>; catalog: Array<{ id: string; name: string; installed: boolean }> }
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

export type PreviewSize = 'phone' | 'tablet' | 'laptop' | 'desktop'

const PREVIEW_SIZES: { id: PreviewSize; label: string }[] = [
  { id: 'phone', label: 'Phone' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'laptop', label: 'Laptop' },
  { id: 'desktop', label: 'Desktop' },
]

const ORDER_TOUR_STORAGE_KEY = 'reelagad-order-tour-done'

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
    target: '#order-form-submit-btn',
    content: 'When you’re ready, click here to continue to secure payment. You’ll get your reel when it’s done.',
    disableBeacon: true,
  },
]

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
}

export default function OrderPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [orderId, setOrderId] = useState<string | null>(null)

  const [fonts, setFonts] = useState<FontItem[]>([])
  const [clips, setClips] = useState<ClipItem[]>([])
  const [voices, setVoices] = useState<Array<{ id: string; name: string; engine: string }>>([])
  const [pricing, setPricing] = useState<{ wordsPerFrame: number; pricePerFramePesos: number } | null>(null)

  const [script, setScript] = useState('')
  const [title, setTitle] = useState('')
  const [fontId, setFontId] = useState('')
  const [clipName, setClipName] = useState('')
  /** When user uploads a video, we store its URL for preview (clipName holds the filename for the order). */
  const [uploadedClipUrl, setUploadedClipUrl] = useState<string | null>(null)
  const [uploadingClip, setUploadingClip] = useState(false)
  const [clipTranscript, setClipTranscript] = useState<ClipTranscriptInfo | null>(null)
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

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [previewFrameIndex, setPreviewFrameIndex] = useState(0)
  const [runTour, setRunTour] = useState(false)
  const [tourStepIndex, setTourStepIndex] = useState(0)
  const [previewSize, setPreviewSize] = useState<PreviewSize>('phone')
  /** PayMongo QR Ph: after creating payment intent we show scan-to-pay page with PayMongo's QR (amount >= ₱20). */
  const [paymongoQrImageUrl, setPaymongoQrImageUrl] = useState<string | null>(null)
  const [paymongoAmountPesos, setPaymongoAmountPesos] = useState<number | null>(null)

  /** From API GET /api/orders/pricing; safe fallbacks only when API has not responded yet. */
  const wordsPerFrame = pricing?.wordsPerFrame ?? 1
  const pricePerFramePesos = pricing?.pricePerFramePesos ?? 0
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
      if (pricingData && typeof pricingData.wordsPerFrame === 'number' && typeof pricingData.pricePerFramePesos === 'number') {
        setPricing({ wordsPerFrame: pricingData.wordsPerFrame, pricePerFramePesos: pricingData.pricePerFramePesos })
      }
      const typedVoiceData = voiceData as VoicesRes | null
      if (typedVoiceData) {
        const list: Array<{ id: string; name: string; engine: string }> = []
        if (typedVoiceData.edge?.length) {
          typedVoiceData.edge.forEach((v) => list.push({ id: v.id, name: v.name, engine: 'edge' }))
        }
        if (typedVoiceData.piper?.installed?.length) {
          typedVoiceData.piper.installed.forEach((v) => list.push({ id: v.id, name: v.name, engine: 'piper' }))
        }
        if (typedVoiceData.pyttsx3?.length) {
          typedVoiceData.pyttsx3.forEach((v) => list.push({ id: v.id, name: v.name, engine: 'pyttsx3' }))
        }
        setVoices(list)
        if (typedVoiceData.defaultVoiceId && !voiceName) {
          setVoiceName(typedVoiceData.defaultVoiceId)
          setVoiceEngine(typedVoiceData.defaultEngine ?? 'edge')
        }
      }
    }).catch(() => setError('Could not load options. Is the API running?'))
  }, [])

  async function handleSubmitOrder(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const hasClip = Boolean(clipName)
    const transcriptReady = clipTranscript?.status === 'completed' && Boolean(clipTranscript.text)
    if ((!script.trim() && !hasClip) || !fontId || !voiceName) {
      setError('Please fill in font and voice. Script is required if no clip is uploaded.')
      return
    }
    if (!script.trim() && hasClip && !transcriptReady) {
      const noSpeech = clipTranscript?.status === 'empty' || clipTranscript?.status === 'failed'
      setError(
        noSpeech
          ? 'No speech was detected in your clip. Enter a script above to continue.'
          : 'Transcript not ready yet. Please wait or enter a script.'
      )
      return
    }
    const maxWords = useClipAudioWithNarrator ? clipTranscript?.maxWordsForNarration : null
    if (maxWords != null && script.trim().length > 0) {
      const count = wordCount(script)
      if (count > maxWords) {
        setError(
          `Your script has ${count} words. When you choose "My video's sound plus a voice reads my words", use at most ${maxWords} words so the voice fits the video. Shorten your script.`
        )
        return
      }
    }
    const paymentFrames = scriptToFrames(effectiveScript, wordsPerFrame)
    const amountPesos = paymentFrames.length * pricePerFramePesos
    if (amountPesos < 1) {
      setError('Amount must be at least ₱1.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const id = await ensureOrderId()
      const origin = window.location.origin

      if (amountPesos >= 20) {
        const res = await fetch(`${API}/api/orders/${id}/paymongo-qr`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amountPesos }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error((err as { message?: string }).message || 'QR payment failed')
        }
        const data = (await res.json()) as { qrImageUrl: string; amountPesos: number }
        if (data.qrImageUrl) {
          setPaymongoQrImageUrl(data.qrImageUrl)
          setPaymongoAmountPesos(data.amountPesos)
          return
        }
        throw new Error('No QR image returned')
      }

      const res = await fetch(`${API}/api/orders/${id}/paymongo-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountPesos,
          successUrl: `${origin}/receipt/${id}`,
          cancelUrl: `${origin}/order?orderId=${id}`,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { message?: string }).message || 'Checkout failed')
      }
      const data = (await res.json()) as { checkoutUrl: string }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
      }
      throw new Error('No checkout URL returned')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open checkout. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleJoyrideCallback(data: { action?: string; index?: number; status?: string; type?: string }) {
    const action = data.action ?? ''
    const index = typeof data.index === 'number' ? data.index : 0
    const status = data.status ?? ''
    const type = data.type ?? ''
    // Only end the tour on explicit finish or skip; ignore error/target_not_found so one missing target doesn't kill the tour
    if (status === 'finished' || status === 'skipped') {
      setRunTour(false)
      setTourStepIndex(0)
      try {
        localStorage.setItem(ORDER_TOUR_STORAGE_KEY, '1')
      } catch {
        // ignore
      }
      return
    }
    // Controlled mode: advance step on Next/Prev. Use previous state so we don't depend on callback index semantics.
    if (action === 'next') {
      setTourStepIndex((prev) => Math.min(prev + 1, ORDER_FORM_STEPS.length - 1))
    } else if (action === 'prev') {
      setTourStepIndex((prev) => Math.max(prev - 1, 0))
    }
  }

  function handleClipSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value
    setClipName(value)
    setUploadedClipUrl(null)
    setClipTranscript(null)
  }

  async function handleClipUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingClip(true)
    setError('')
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
    } finally {
      setUploadingClip(false)
      e.target.value = ''
    }
  }

  // Restore form when returning from PayMongo (cancel) with ?orderId=xxx
  useEffect(() => {
    const id = searchParams.get('orderId')
    if (!id) return
    fetch(`${API}/api/orders/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((order: OrderSnapshot | null) => {
        if (!order) return
        setOrderId(order.id)
        setScript(order.script ?? '')
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
          if (order.clipName.startsWith('order-')) {
            setUploadedClipUrl(`${API}/media/order-clips/${encodeURIComponent(order.clipName)}`)
          }
        }
        setUseClipAudio(Boolean(order.useClipAudio))
        setUseClipAudioWithNarrator(Boolean(order.useClipAudioWithNarrator))
        setSearchParams({}, { replace: true })
      })
      .catch(() => {})
  }, [searchParams, setSearchParams])

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
            setScript(data.text)
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

  async function ensureOrderId(): Promise<string> {
    const payload = {
      script: script.trim() || clipTranscript?.text || '',
      title: title.trim() || undefined,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      deliveryAddress: deliveryAddress.trim(),
      outputSize: previewSize,
      ...(clipName && {
        useClipAudio: useClipAudio || useClipAudioWithNarrator,
        useClipAudioWithNarrator: useClipAudioWithNarrator || undefined,
      }),
    }
    if (orderId) {
      const patchRes = await fetch(`${API}/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!patchRes.ok) throw new Error('Failed to update order')
      return orderId
    }
    const createRes = await fetch(`${API}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        fontId,
        clipName: clipName || undefined,
        voiceEngine,
        voiceName,
      }),
    })
    if (!createRes.ok) throw new Error('Order failed')
    const created = await createRes.json()
    const id = created.id as string
    setOrderId(id)
    return id
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
      : 'Redirecting to checkout…'

  if (paymongoQrImageUrl && paymongoAmountPesos != null) {
    return (
      <div className="container order-page">
        <div className="card payment-qr-card">
          <h1 className="payment-qr-title">Scan to pay</h1>
          <p className="payment-qr-amount" aria-label={`Amount: ${paymongoAmountPesos} pesos`}>
            Amount: <strong>₱{paymongoAmountPesos.toLocaleString()}</strong>
          </p>
          <p className="payment-qr-hint">
            Scan the QR code with GCash, Maya, or your bank app to complete payment.
          </p>
          <div className="payment-qr-wrap">
            <img
              src={paymongoQrImageUrl}
              alt="QR code: scan to pay with GCash, Maya, or bank app"
              className="payment-qr-image"
              width={280}
              height={280}
            />
          </div>
          <button
            type="button"
            className="btn payment-qr-btn-back"
            onClick={() => {
              setPaymongoQrImageUrl(null)
              setPaymongoAmountPesos(null)
            }}
          >
            Back to order
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container order-page">
      {!paymongoQrImageUrl && (
        <Joyride
          key={runTour ? 'tour-active' : 'tour-idle'}
          steps={ORDER_FORM_STEPS}
          run={runTour}
          stepIndex={tourStepIndex}
          callback={handleJoyrideCallback}
          continuous
          showProgress
          showSkipButton
          scrollToFirstStep
          scrollOffset={80}
          spotlightPadding={8}
          disableOverlayClose={false}
          floaterProps={{ disableAnimation: true }}
          styles={{
            options: {
              primaryColor: 'var(--accent, #F36F21)',
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
            onClick={() => {
              setTourStepIndex(0)
              setRunTour(true)
            }}
            aria-label="Start a short guided tour of the order form"
          >
            <span aria-hidden>▶</span> Take a tour
          </button>
        </header>
        {error && <p style={{ color: '#dc2626', marginBottom: '1rem' }}>{error}</p>}

        <>
            <style>{fonts.filter((f) => isCustomFontFile(f.id)).map((f) => `
              @font-face {
                font-family: "OrderFont-${f.id.replace(/[^a-z0-9.-]/gi, '_')}";
                src: url("${API}/media/fonts/${encodeURIComponent(f.id)}");
              }
            `).join('')}</style>
            <div className="order-page-layout">
              <form onSubmit={handleSubmitOrder} className="order-form-column">
                <section className="order-form-step" aria-labelledby="order-step-content-heading">
                  <h2 id="order-step-content-heading" className="order-form-step-title">Content</h2>
                  <p className="order-form-step-intro">The words that will appear and be read in your reel.</p>
                  <div className="field">
                    <label className="label" htmlFor="order-script">Script</label>
                    <p className="field-hint field-hint-above">Paste or type your script. If you add a video with speech below, we can transcribe it for you.</p>
                    {clipName && useClipAudioWithNarrator && clipTranscript?.maxWordsForNarration != null && (
                      <p
                        className={`script-allowed-words${wordCount(script) > clipTranscript.maxWordsForNarration ? ' script-over-limit' : ''}`}
                        aria-live="polite"
                      >
                        Allowed words: <strong>{clipTranscript.maxWordsForNarration}</strong>
                        {script.trim().length > 0 && (
                          <> — Words: {wordCount(script)} / {clipTranscript.maxWordsForNarration}</>
                        )}
                      </p>
                    )}
                    <textarea
                      id="order-script"
                      value={script}
                      onChange={(e) => setScript(e.target.value)}
                      placeholder="e.g. Welcome to our channel. Today we're talking about…"
                      rows={5}
                    />
                    {clipName && clipTranscript?.status && (
                      <p className="field-hint">
                        {clipTranscript.status === 'empty' || clipTranscript.status === 'failed' ? (
                          <>
                            No human speech detected. You can write your own script above.
                            {useClipAudioWithNarrator && clipTranscript.maxWordsForNarration != null ? (
                              <> For &quot;video sound + voice&quot;, use at most <strong>{clipTranscript.maxWordsForNarration} words</strong>.</>
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
                    {clipName && useClipAudioWithNarrator && clipTranscript?.durationSeconds != null && clipTranscript?.maxWordsForNarration != null && (
                      <p className="field-hint clip-duration-hint">
                        Video is {Math.round(clipTranscript.durationSeconds)}s. Use up to <strong>{clipTranscript.maxWordsForNarration} words</strong> so the voice fits.
                        {script.trim().length > 0 && (
                          <> — {wordCount(script)} / {clipTranscript.maxWordsForNarration}</>
                        )}
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

                <section className="order-form-step" aria-labelledby="order-step-style-heading">
                  <h2 id="order-step-style-heading" className="order-form-step-title">Look</h2>
                  <p className="order-form-step-intro">Font and optional video background. Check the preview to the right.</p>
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
                    <label className="label" htmlFor="order-clip">Background video (optional)</label>
                    <p className="field-hint field-hint-above">None = captions only. Or pick a clip / upload your own.</p>
                    <select id="order-clip" value={clipName} onChange={handleClipSelect}>
                      <option value="">None — caption style only</option>
                      {uploadedClipUrl && clipName && (
                        <option value={clipName}>Your uploaded video</option>
                      )}
                      {clips.map((c) => (
                        <option key={c.name} value={c.name}>{c.displayName ?? c.name}</option>
                      ))}
                    </select>
                    <div className="upload-own-video">
                      <p className="upload-own-video-heading">Or upload your own video</p>
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
                    {clipName && (
                      <div className="field clip-audio-options" role="group" aria-label="How should your video sound?">
                        <span className="label">How should your video sound?</span>
                        <label className="clip-audio-option">
                          <input
                            type="radio"
                            name="clipAudioOption"
                            value=""
                            checked={!useClipAudio && !useClipAudioWithNarrator}
                            onChange={() => {
                              setUseClipAudio(false)
                              setUseClipAudioWithNarrator(false)
                            }}
                          />
                          <span>Just a voice reads my words (no sound from my video)</span>
                        </label>
                        <label className="clip-audio-option">
                          <input
                            type="radio"
                            name="clipAudioOption"
                            value="no_narrator"
                            checked={useClipAudio && !useClipAudioWithNarrator}
                            onChange={() => {
                              setUseClipAudio(true)
                              setUseClipAudioWithNarrator(false)
                            }}
                          />
                          <span>Keep my video&apos;s sound only (no voice reading)</span>
                        </label>
                        <label className="clip-audio-option">
                          <input
                            type="radio"
                            name="clipAudioOption"
                            value="with_narrator"
                            checked={useClipAudioWithNarrator}
                            onChange={() => {
                              setUseClipAudio(true)
                              setUseClipAudioWithNarrator(true)
                            }}
                          />
                          <span>My video&apos;s sound plus a voice reads my words</span>
                        </label>
                      </div>
                    )}
                  </div>
                </section>

                <section className="order-form-step" aria-labelledby="order-step-voice-heading">
                  <h2 id="order-step-voice-heading" className="order-form-step-title">Voice</h2>
                  <p className="order-form-step-intro">The voice that will read your script (unless you chose &quot;video sound only&quot; above).</p>
                  <div className="field">
                    <label className="label" htmlFor="order-voice">Narrator voice</label>
                    <select
                      id="order-voice"
                      value={voiceEngine + '::' + voiceName}
                      onChange={(e) => {
                        const v = e.target.value
                        const [eng, name] = v.split('::')
                        setVoiceEngine(eng)
                        setVoiceName(name)
                      }}
                      required
                    >
                      {voices.map((v) => (
                        <option key={v.engine + v.id} value={v.engine + '::' + v.id}>{v.name} ({v.engine})</option>
                      ))}
                    </select>
                  </div>
                </section>

                <section className="order-form-step" aria-labelledby="order-step-details-heading">
                  <h2 id="order-step-details-heading" className="order-form-step-title">Your details</h2>
                  <p className="order-form-step-intro">Optional. If you fill these in, they will be prefilled on the payment page.</p>
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
                  <button type="submit" id="order-form-submit-btn" className="btn order-form-submit-btn" disabled={submitting}>
                    {submitting ? 'Redirecting to checkout…' : 'Continue to payment'}
                  </button>
                  <p className="order-form-submit-hint">You&apos;ll pay securely and get your reel when it&apos;s ready.</p>
                </div>
              </form>

              <aside className="order-preview-column" aria-label="Live preview">
                <h2 className="order-preview-label">Live preview</h2>
                <p className="order-preview-clip-name">
                  {clipName
                    ? (uploadedClipUrl ? 'Your uploaded video' : clipName)
                    : 'Caption style (no clip)'}
                </p>
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
                <div className="order-preview-size-row">
                  <label className="order-preview-size-label">Screen size (output):</label>
                  <select
                    className="order-preview-size-select"
                    value={previewSize}
                    onChange={(e) => setPreviewSize(e.target.value as PreviewSize)}
                    aria-label="Video output screen size"
                  >
                    {PREVIEW_SIZES.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <p className="order-preview-screen-size muted small">
                  Your video will be delivered in <strong>{PREVIEW_SIZES.find((s) => s.id === previewSize)?.label ?? previewSize}</strong> format.
                </p>
                <div className="order-preview-frame" data-preview-size={previewSize}>
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
                    className="order-preview-overlay"
                    style={{ fontFamily: fontFamilyFor(fontId) }}
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
              </aside>
            </div>
        </>
      </div>
    </div>
  )
}
