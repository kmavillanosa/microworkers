import { useEffect, useMemo, useState } from 'react'
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

const OUTPUT_SIZE_OPTIONS: Array<{ id: StudioOutputSize; label: string }> = [
    { id: 'phone', label: 'Phone' },
    { id: 'tablet', label: 'Tablet' },
    { id: 'laptop', label: 'Laptop' },
    { id: 'desktop', label: 'Desktop' },
]

function toMediaUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path
    }

    return `${apiBaseUrl}${path}`
}

function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length
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

    const wordsPerFrame = Math.max(1, Math.floor(orderPricing?.wordsPerFrame ?? 4))
    const scriptWordCount = countWords(script)
    const estimatedFrames = scriptWordCount > 0 ? Math.ceil(scriptWordCount / wordsPerFrame) : 0

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

        if (!voiceEngine.trim() || !voiceName.trim()) {
            setError('Please select a narrator voice.')
            return
        }

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
                voiceEngine: voiceEngine.trim(),
                voiceName: voiceName.trim(),
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
                    <section className="grid gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-700">
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

                            <label className="space-y-1">
                                <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Narrator voice</span>
                                <select
                                    value={selectedVoiceValue}
                                    onChange={(event) => handleVoiceSelect(event.target.value)}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                >
                                    <option value="">Select voice</option>
                                    {voiceOptions.map((voice) => (
                                        <option key={`${voice.engine}:${voice.id}`} value={`${voice.engine}:${voice.id}`}>
                                            {voice.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <label className="space-y-1">
                            <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Background clip (optional)</span>
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
                                {selectedVoice ? selectedVoice.label : 'Select a voice'}
                            </p>
                        </div>

                        <div className="grid gap-2 rounded-md border border-gray-200 p-2 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
                            <p>Words: <strong>{scriptWordCount}</strong></p>
                            <p>Est. frames: <strong>{estimatedFrames}</strong> (wpf: {wordsPerFrame})</p>
                            <p>Output size: <strong>{outputSize}</strong></p>
                            <p>Clip: <strong>{selectedClip?.displayName ?? selectedClip?.name ?? 'None'}</strong></p>
                        </div>

                        {selectedClip?.url ? (
                            <video
                                src={toMediaUrl(selectedClip.url)}
                                controls
                                className="max-h-72 w-full rounded-md border border-gray-300 bg-black object-contain dark:border-gray-700"
                            />
                        ) : (
                            <div className="rounded-md border border-dashed border-gray-300 p-4 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                Select a clip to preview video.
                            </div>
                        )}

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
