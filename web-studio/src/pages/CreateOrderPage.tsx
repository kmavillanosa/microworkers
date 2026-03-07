import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Card } from 'flowbite-react'
import { Link } from 'react-router-dom'
import { apiBaseUrl } from '../api/client'
import { studioApi } from '../api/studioApi'
import type {
    ClipItem,
    FontsResponse,
    OrderPricing,
    StudioOutputSize,
    VoicesResponse,
} from '../api/types'

type CreateOrderPageProps = {
    fonts: FontsResponse | null
    orderClips: ClipItem[]
    voices: VoicesResponse | null
    orderPricing: OrderPricing | null
}

type VoiceOption = {
    id: string
    engine: string
    label: string
}

type VoiceoverMode = 'voiceover_only' | 'video_sound_only' | 'video_sound_and_voiceover'

type VoiceoverModeOption = {
    id: VoiceoverMode
    label: string
    description: string
}

const VOICEOVER_MODE_OPTIONS: VoiceoverModeOption[] = [
    {
        id: 'voiceover_only',
        label: 'Voiceover only',
        description: 'Only our narrator voice is used. Your video sound is muted.',
    },
    {
        id: 'video_sound_only',
        label: 'Video sound only',
        description: "Only your video's original sound is used. No extra voiceover.",
    },
    {
        id: 'video_sound_and_voiceover',
        label: 'Video sound + voiceover',
        description: 'Keep your video sound and add a narrator voice.',
    },
]

function toOrderAudioFlags(mode: VoiceoverMode): {
    useClipAudio: boolean
    useClipAudioWithNarrator: boolean
} {
    if (mode === 'video_sound_and_voiceover') {
        return {
            useClipAudio: true,
            useClipAudioWithNarrator: true,
        }
    }

    if (mode === 'video_sound_only') {
        return {
            useClipAudio: true,
            useClipAudioWithNarrator: false,
        }
    }

    return {
        useClipAudio: false,
        useClipAudioWithNarrator: false,
    }
}

const OUTPUT_SIZE_OPTIONS: Array<{ id: StudioOutputSize; label: string }> = [
    { id: 'phone', label: 'Phone' },
    { id: 'tablet', label: 'Tablet' },
    { id: 'laptop', label: 'Laptop' },
    { id: 'desktop', label: 'Desktop' },
]

const OUTPUT_PREVIEW_FRAME: Record<StudioOutputSize, { aspectRatio: string; maxWidth: string }> = {
    phone: { aspectRatio: '9 / 16', maxWidth: '220px' },
    tablet: { aspectRatio: '4 / 3', maxWidth: '300px' },
    laptop: { aspectRatio: '16 / 10', maxWidth: '360px' },
    desktop: { aspectRatio: '16 / 9', maxWidth: '420px' },
}

function toMediaUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path
    }

    return `${apiBaseUrl}${path}`
}

function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length
}

function toPreviewScriptLine(text: string, maxWords = 18): string {
    const words = text.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) {
        return 'Your script preview will appear here.'
    }

    const clipped = words.slice(0, maxWords).join(' ')
    return words.length > maxWords ? `${clipped}…` : clipped
}

export function CreateOrderPage({
    fonts,
    orderClips,
    voices,
    orderPricing,
}: CreateOrderPageProps) {
    const [script, setScript] = useState('')
    const [title, setTitle] = useState('')
    const [fontId, setFontId] = useState('')
    const [clipName, setClipName] = useState('')
    const [voiceEngine, setVoiceEngine] = useState('')
    const [voiceName, setVoiceName] = useState('')
    const [voiceoverMode, setVoiceoverMode] = useState<VoiceoverMode>('voiceover_only')
    const [outputSize, setOutputSize] = useState<StudioOutputSize>('phone')
    const [customerName, setCustomerName] = useState('')
    const [customerEmail, setCustomerEmail] = useState('')
    const [deliveryAddress, setDeliveryAddress] = useState('')
    const [availableOrderClips, setAvailableOrderClips] = useState<ClipItem[]>(orderClips)
    const [clipUploading, setClipUploading] = useState(false)
    const [clipUploadMessage, setClipUploadMessage] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [createdOrderId, setCreatedOrderId] = useState<string | null>(null)
    const [voicePreviewPlaying, setVoicePreviewPlaying] = useState(false)
    const [voicePreviewMessage, setVoicePreviewMessage] = useState<string | null>(null)
    const [voicePreviewError, setVoicePreviewError] = useState<string | null>(null)
    const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null)
    const voicePreviewUrlRef = useRef<string | null>(null)

    const voiceOptions = useMemo<VoiceOption[]>(() => {
        const options: VoiceOption[] = []

        voices?.edge?.forEach((voice) => {
            options.push({
                id: voice.id,
                engine: 'edge',
                label: `${voice.name} (Edge${voice.locale ? ` • ${voice.locale}` : ''})`,
            })
        })

        voices?.piper?.installed?.forEach((voice) => {
            options.push({
                id: voice.id,
                engine: 'piper',
                label: `${voice.name} (Piper)`,
            })
        })

        voices?.pyttsx3?.forEach((voice) => {
            options.push({
                id: voice.id,
                engine: 'pyttsx3',
                label: `${voice.name} (Pyttsx3)`,
            })
        })

        return options
    }, [voices])

    const selectedClip = useMemo(
        () => availableOrderClips.find((clip) => clip.name === clipName) ?? null,
        [availableOrderClips, clipName],
    )

    const selectedVoice = useMemo(
        () => voiceOptions.find((voice) => voice.engine === voiceEngine && voice.id === voiceName) ?? null,
        [voiceEngine, voiceName, voiceOptions],
    )

    const resolvedVoice = useMemo(() => {
        if (selectedVoice) {
            return selectedVoice
        }

        return voiceOptions[0] ?? null
    }, [selectedVoice, voiceOptions])

    const narratorEnabled = voiceoverMode !== 'video_sound_only'
    const usesVideoSound = voiceoverMode !== 'voiceover_only'

    const wordsPerFrame = Math.max(1, Math.floor(orderPricing?.wordsPerFrame ?? 4))
    const scriptWordCount = countWords(script)
    const estimatedFrames = scriptWordCount > 0 ? Math.ceil(scriptWordCount / wordsPerFrame) : 0
    const previewFrame = OUTPUT_PREVIEW_FRAME[outputSize]
    const previewScriptLine = useMemo(() => toPreviewScriptLine(script), [script])

    const stopVoicePreview = useCallback(() => {
        if (voicePreviewAudioRef.current) {
            voicePreviewAudioRef.current.pause()
            voicePreviewAudioRef.current.src = ''
            voicePreviewAudioRef.current = null
        }

        if (voicePreviewUrlRef.current) {
            URL.revokeObjectURL(voicePreviewUrlRef.current)
            voicePreviewUrlRef.current = null
        }
    }, [])

    useEffect(() => {
        setAvailableOrderClips(orderClips)
    }, [orderClips])

    useEffect(() => {
        if (fontId) {
            return
        }

        const fallbackFont = fonts?.defaultFont ?? fonts?.items?.[0]?.id ?? ''
        if (fallbackFont) {
            setFontId(fallbackFont)
        }
    }, [fontId, fonts])

    useEffect(() => {
        if (voiceName || voiceOptions.length === 0) {
            return
        }

        const preferred = voices?.defaultVoiceId
            ? voiceOptions.find((voice) => voice.id === voices.defaultVoiceId)
            : undefined
        const picked = preferred ?? voiceOptions[0]
        if (!picked) {
            return
        }

        setVoiceEngine(picked.engine)
        setVoiceName(picked.id)
    }, [voiceName, voiceOptions, voices?.defaultVoiceId])

    useEffect(() => {
        return () => {
            stopVoicePreview()
        }
    }, [stopVoicePreview])

    useEffect(() => {
        if (!narratorEnabled && voicePreviewPlaying) {
            stopVoicePreview()
            setVoicePreviewPlaying(false)
            setVoicePreviewMessage(null)
        }
    }, [narratorEnabled, stopVoicePreview, voicePreviewPlaying])

    const selectedVoiceValue = voiceName ? `${voiceEngine}:${voiceName}` : ''

    const handleVoiceSelect = (value: string) => {
        const [engine, id] = value.split(':')
        if (!engine || !id) {
            setVoiceEngine('')
            setVoiceName('')
            return
        }

        setVoiceEngine(engine)
        setVoiceName(id)
    }

    const handleCreateOrder = async (event: React.FormEvent) => {
        event.preventDefault()
        setError(null)
        setMessage(null)

        const trimmedScript = script.trim()
        if (!trimmedScript && !clipName) {
            setError('Script is required when no clip is selected.')
            return
        }

        if (!fontId.trim()) {
            setError('Please select a font.')
            return
        }

        if (usesVideoSound && !clipName) {
            setError('Please select or upload a clip for this audio mode.')
            return
        }

        if (!resolvedVoice) {
            setError('No narrator voice is available. Please install or enable at least one voice.')
            return
        }

        const { useClipAudio, useClipAudioWithNarrator } = toOrderAudioFlags(voiceoverMode)

        setSubmitting(true)

        try {
            const created = await studioApi.createOrder({
                script: trimmedScript || undefined,
                title: title.trim() || undefined,
                customerName: customerName.trim() || undefined,
                customerEmail: customerEmail.trim() || undefined,
                deliveryAddress: deliveryAddress.trim() || undefined,
                outputSize,
                fontId: fontId.trim(),
                clipName: clipName || undefined,
                voiceEngine: resolvedVoice.engine,
                voiceName: resolvedVoice.id,
                useClipAudio,
                useClipAudioWithNarrator,
                isInHouse: true,
            })

            setCreatedOrderId(created.id)
            setMessage(`Order ${created.id.slice(-12)} created without payment.`)
        } catch {
            setError('Failed to create order. Please check required fields and try again.')
        } finally {
            setSubmitting(false)
        }
    }

    const handleUploadOwnClip = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) {
            return
        }

        setClipUploading(true)
        setClipUploadMessage(null)
        setError(null)

        try {
            const uploaded = await studioApi.uploadOrderClip(file)
            setAvailableOrderClips((current) => [
                uploaded,
                ...current.filter((clip) => clip.name !== uploaded.name),
            ])
            setClipName(uploaded.name)
            setClipUploadMessage(`Uploaded ${uploaded.displayName ?? uploaded.name}.`)
        } catch {
            setError('Failed to upload clip.')
        } finally {
            setClipUploading(false)
            event.target.value = ''
        }
    }

    const handlePreviewVoice = useCallback(async () => {
        if (!narratorEnabled) {
            setVoicePreviewError('Narrator is disabled for the selected audio mode.')
            return
        }

        if (voicePreviewPlaying) {
            stopVoicePreview()
            setVoicePreviewPlaying(false)
            setVoicePreviewMessage('Voice sample stopped.')
            return
        }

        if (!resolvedVoice) {
            setVoicePreviewError('Please select a voice first.')
            return
        }

        setVoicePreviewError(null)
        setVoicePreviewMessage(null)
        stopVoicePreview()
        setVoicePreviewPlaying(true)

        try {
            const previewText = script.trim().slice(0, 500)
            const blob = await studioApi.previewVoice(resolvedVoice.id, previewText || undefined)
            const objectUrl = URL.createObjectURL(blob)
            const audio = new Audio(objectUrl)

            voicePreviewUrlRef.current = objectUrl
            voicePreviewAudioRef.current = audio

            audio.onended = () => {
                stopVoicePreview()
                setVoicePreviewPlaying(false)
                setVoicePreviewMessage('Voice sample finished.')
            }

            audio.onerror = () => {
                stopVoicePreview()
                setVoicePreviewPlaying(false)
                setVoicePreviewError('Voice preview is not available for this voice.')
            }

            setVoicePreviewMessage('Playing voice sample...')
            await audio.play()
        } catch {
            stopVoicePreview()
            setVoicePreviewPlaying(false)
            setVoicePreviewError('Failed to play voice sample preview.')
        }
    }, [narratorEnabled, resolvedVoice, script, stopVoicePreview, voicePreviewPlaying])

    return (
        <>
            <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Create order (no payment)</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            Internal order creation with a simple form and live preview.
                        </p>
                    </div>
                    <Link
                        to="/orders"
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                        Back to orders
                    </Link>
                </div>
            </Card>

            {message ? <Alert color="success">{message}</Alert> : null}
            {error ? <Alert color="failure">{error}</Alert> : null}

            <Card>
                <form
                    onSubmit={handleCreateOrder}
                    className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,1fr)]"
                >
                    <section className="grid gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-700 [&_video:not(.generated-preview-video)]:hidden">
                        <label className="space-y-1">
                            <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Script</span>
                            <textarea
                                value={script}
                                onChange={(event) => setScript(event.target.value)}
                                rows={8}
                                placeholder="Enter script here..."
                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                            />
                        </label>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1">
                                <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Title (optional)</span>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(event) => setTitle(event.target.value)}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                />
                            </label>

                            <label className="space-y-1">
                                <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Output size</span>
                                <select
                                    value={outputSize}
                                    onChange={(event) => setOutputSize(event.target.value as StudioOutputSize)}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                >
                                    {OUTPUT_SIZE_OPTIONS.map((option) => (
                                        <option key={option.id} value={option.id}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1">
                                <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Font</span>
                                <select
                                    value={fontId}
                                    onChange={(event) => setFontId(event.target.value)}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                >
                                    <option value="">Select font</option>
                                    {(fonts?.items ?? []).map((font) => (
                                        <option key={font.id} value={font.id}>
                                            {font.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <div className="space-y-1">
                                <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Voiceover mode</span>
                                <div className="grid gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-700">
                                    {VOICEOVER_MODE_OPTIONS.map((option) => (
                                        <label
                                            key={option.id}
                                            className="flex cursor-pointer gap-2 rounded-md border border-transparent px-2 py-1.5 hover:border-gray-300 hover:bg-gray-50 dark:hover:border-gray-600 dark:hover:bg-gray-800"
                                        >
                                            <input
                                                type="radio"
                                                name="voiceoverMode"
                                                value={option.id}
                                                checked={voiceoverMode === option.id}
                                                onChange={() => setVoiceoverMode(option.id)}
                                                className="mt-0.5"
                                            />
                                            <span>
                                                <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                                                    {option.label}
                                                </span>
                                                <span className="block text-xs text-gray-500 dark:text-gray-400">
                                                    {option.description}
                                                </span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <label className="space-y-1">
                            <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Narrator voice</span>
                            <select
                                value={selectedVoiceValue}
                                onChange={(event) => handleVoiceSelect(event.target.value)}
                                disabled={!narratorEnabled}
                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                            >
                                <option value="">Select voice</option>
                                {voiceOptions.map((voice) => (
                                    <option key={`${voice.engine}:${voice.id}`} value={`${voice.engine}:${voice.id}`}>
                                        {voice.label}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {narratorEnabled
                                    ? 'Used for voiceover modes that include narration.'
                                    : 'Narrator is disabled while using video sound only.'}
                            </p>
                        </label>

                        <label className="space-y-1">
                            <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                {usesVideoSound ? 'Background clip (required for selected audio mode)' : 'Background clip (optional)'}
                            </span>
                            <select
                                value={clipName}
                                onChange={(event) => setClipName(event.target.value)}
                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                            >
                                <option value="">None</option>
                                {availableOrderClips.map((clip) => (
                                    <option key={clip.name} value={clip.name}>
                                        {clip.displayName ?? clip.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="space-y-1">
                            <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Upload your own clip</span>
                            <input
                                type="file"
                                accept="video/*"
                                onChange={handleUploadOwnClip}
                                disabled={clipUploading}
                                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {clipUploading
                                    ? 'Uploading clip...'
                                    : 'Choose a video file. It will be uploaded and selected automatically.'}
                            </p>
                            {clipUploadMessage ? (
                                <p className="text-xs text-emerald-700 dark:text-emerald-300">{clipUploadMessage}</p>
                            ) : null}
                        </label>

                        <div className="grid gap-3 sm:grid-cols-3">
                            <label className="space-y-1 sm:col-span-1">
                                <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Name</span>
                                <input
                                    type="text"
                                    value={customerName}
                                    onChange={(event) => setCustomerName(event.target.value)}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                />
                            </label>
                            <label className="space-y-1 sm:col-span-1">
                                <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Email</span>
                                <input
                                    type="email"
                                    value={customerEmail}
                                    onChange={(event) => setCustomerEmail(event.target.value)}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                />
                            </label>
                            <label className="space-y-1 sm:col-span-1">
                                <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Address</span>
                                <input
                                    type="text"
                                    value={deliveryAddress}
                                    onChange={(event) => setDeliveryAddress(event.target.value)}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                />
                            </label>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {submitting ? 'Creating…' : 'Create order (no payment)'}
                            </button>
                            {createdOrderId ? (
                                <Link
                                    to="/orders"
                                    className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                    Open orders list
                                </Link>
                            ) : null}
                        </div>
                    </section>

                    <section className="grid gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-700">
                        <div>
                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Preview</p>
                            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                                {narratorEnabled
                                    ? (resolvedVoice?.label ?? 'Select a voice')
                                    : 'Video sound only (narrator disabled)'}
                            </p>
                        </div>

                        <div className="grid gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-700">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Voice sample preview
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    void handlePreviewVoice()
                                }}
                                disabled={(!resolvedVoice && !voicePreviewPlaying) || !narratorEnabled}
                                className="inline-flex w-fit rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-slate-700 dark:hover:bg-slate-600"
                            >
                                {voicePreviewPlaying ? 'Stop sample' : 'Play voice sample'}
                            </button>
                            {voicePreviewMessage ? (
                                <p className="text-xs text-emerald-700 dark:text-emerald-300">{voicePreviewMessage}</p>
                            ) : null}
                            {voicePreviewError ? (
                                <p className="text-xs text-red-700 dark:text-red-300">{voicePreviewError}</p>
                            ) : null}
                        </div>

                        <div className="grid gap-2 rounded-md border border-gray-200 p-2 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
                            <p>Words: <strong>{scriptWordCount}</strong></p>
                            <p>Est. frames: <strong>{estimatedFrames}</strong> (wpf: {wordsPerFrame})</p>
                            <p>Output size: <strong>{outputSize}</strong></p>
                            <p>
                                Audio mode:{' '}
                                <strong>
                                    {voiceoverMode === 'voiceover_only'
                                        ? 'Voiceover only'
                                        : voiceoverMode === 'video_sound_only'
                                            ? 'Video sound only'
                                            : 'Video sound + voiceover'}
                                </strong>
                            </p>
                            <p>Clip: <strong>{selectedClip?.displayName ?? selectedClip?.name ?? 'None'}</strong></p>
                        </div>

                        <div className="grid gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-700">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Preview
                            </p>
                            <div
                                className="relative mx-auto w-full overflow-hidden rounded-md border border-gray-300 bg-black dark:border-gray-700"
                                style={{
                                    aspectRatio: previewFrame.aspectRatio,
                                    maxWidth: previewFrame.maxWidth,
                                }}
                            >
                                {selectedClip?.url ? (
                                    <video
                                        src={toMediaUrl(selectedClip.url)}
                                        muted
                                        loop
                                        autoPlay
                                        playsInline
                                        className="generated-preview-video absolute inset-0 h-full w-full object-cover"
                                    />
                                ) : (
                                    <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-900" />
                                )}

                                <div className="absolute inset-0 flex flex-col justify-between p-3">
                                    <p className="max-w-full truncate text-xs font-semibold text-white drop-shadow-md">
                                        {title.trim() || 'Title preview'}
                                    </p>
                                    <p className="rounded-full bg-black/65 px-2 py-1 text-[11px] font-semibold leading-tight text-white shadow-sm">
                                        {previewScriptLine}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-md border border-gray-200 p-2 dark:border-gray-700">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Script preview
                            </p>
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-gray-800 dark:text-gray-200">
                                {script.trim() || 'Your script preview will appear here.'}
                            </pre>
                        </div>
                    </section>
                </form>
            </Card>
        </>
    )
}
