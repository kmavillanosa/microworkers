import { useEffect, useMemo, useState } from 'react'

const API = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

type PricingTierId = 'tts_only' | 'clip_only' | 'clip_and_narrator'

interface PricingResponse {
    wordsPerFrame: number
    pricePerFramePesos: number
    pricePerFramePesosByTier?: {
        ttsOnly: number
        clipOnly: number
        clipAndNarrator: number
    }
}

const WORDS_PER_SECOND = 2.5

const DEFAULT_PRICING = {
    wordsPerFrame: 5,
    pricePerFramePesosByTier: {
        ttsOnly: 3,
        clipOnly: 5,
        clipAndNarrator: 7,
    },
}

function formatDuration(seconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(seconds))
    const minutes = Math.floor(safeSeconds / 60)
    const remainingSeconds = safeSeconds % 60
    return remainingSeconds < 10 ? `${minutes}:0${remainingSeconds}` : `${minutes}:${remainingSeconds}`
}

function selectedTierPrice(
    tierId: PricingTierId,
    tiers: { ttsOnly: number; clipOnly: number; clipAndNarrator: number },
): number {
    if (tierId === 'clip_only') return tiers.clipOnly
    if (tierId === 'clip_and_narrator') return tiers.clipAndNarrator
    return tiers.ttsOnly
}

function tierLabel(tierId: PricingTierId): string {
    if (tierId === 'clip_only') return 'Video sound only'
    if (tierId === 'clip_and_narrator') return 'Video sound + voiceover'
    return 'Voiceover only'
}

export default function PricingPage() {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [selectedTier, setSelectedTier] = useState<PricingTierId>('tts_only')
    const [durationSeconds, setDurationSeconds] = useState(30)
    const [wordsPerFrame, setWordsPerFrame] = useState(DEFAULT_PRICING.wordsPerFrame)
    const [tiers, setTiers] = useState(DEFAULT_PRICING.pricePerFramePesosByTier)

    useEffect(() => {
        let isCancelled = false
        fetch(`${API}/api/orders/pricing`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data: PricingResponse | null) => {
                if (!data || isCancelled) return

                if (typeof data.wordsPerFrame === 'number' && data.wordsPerFrame > 0) {
                    setWordsPerFrame(data.wordsPerFrame)
                }

                const byTier = data.pricePerFramePesosByTier
                const ttsOnly = byTier?.ttsOnly ?? (typeof data.pricePerFramePesos === 'number' ? data.pricePerFramePesos : DEFAULT_PRICING.pricePerFramePesosByTier.ttsOnly)
                const clipOnly = byTier?.clipOnly ?? DEFAULT_PRICING.pricePerFramePesosByTier.clipOnly
                const clipAndNarrator = byTier?.clipAndNarrator ?? DEFAULT_PRICING.pricePerFramePesosByTier.clipAndNarrator

                setTiers({ ttsOnly, clipOnly, clipAndNarrator })
            })
            .catch(() => {
                setError('Could not load live pricing. Showing default values.')
            })
            .finally(() => {
                if (!isCancelled) setLoading(false)
            })

        return () => {
            isCancelled = true
        }
    }, [])

    const safeDurationSeconds = Math.max(0, Math.min(7200, Math.floor(durationSeconds || 0)))

    const estimatedWords = useMemo(
        () => Math.max(0, Math.floor(safeDurationSeconds * WORDS_PER_SECOND)),
        [safeDurationSeconds],
    )

    const estimatedFrames = useMemo(
        () => (wordsPerFrame > 0 ? Math.ceil(estimatedWords / wordsPerFrame) : 0),
        [estimatedWords, wordsPerFrame],
    )

    const selectedPricePerFrame = selectedTierPrice(selectedTier, tiers)
    const estimatedTotalPesos = estimatedFrames * selectedPricePerFrame

    return (
        <div className="container pricing-page">
            <div className="card pricing-page-card">
                <header className="pricing-page-hero">
                    <h1>Pricing calculator</h1>
                    <p>Choose an audio option and enter your video length to get a quick price estimate.</p>
                </header>

                {error && <p className="pricing-alert">{error}</p>}

                <div className="pricing-page-grid">
                    <div className="pricing-page-left">
                        <section className="pricing-page-section" aria-labelledby="pricing-tier-heading">
                            <h2 id="pricing-tier-heading" className="pricing-page-section-title">1. Choose your audio option</h2>
                            <div className="audio-tier-cards pricing-tier-cards" role="radiogroup" aria-label="Select audio option">
                                <label className={`audio-tier-card ${selectedTier === 'tts_only' ? 'audio-tier-card-selected' : ''}`}>
                                    <input
                                        type="radio"
                                        name="pricingTier"
                                        value="tts_only"
                                        checked={selectedTier === 'tts_only'}
                                        onChange={() => setSelectedTier('tts_only')}
                                        className="audio-tier-card-input"
                                    />
                                    <span className="audio-tier-card-title">Voiceover only</span>
                                    <span className="audio-tier-card-desc">Only our narrator voice is used. Your video sound is muted.</span>
                                    <span className="audio-tier-card-price">₱{tiers.ttsOnly} per frame</span>
                                </label>

                                <label className={`audio-tier-card ${selectedTier === 'clip_only' ? 'audio-tier-card-selected' : ''}`}>
                                    <input
                                        type="radio"
                                        name="pricingTier"
                                        value="clip_only"
                                        checked={selectedTier === 'clip_only'}
                                        onChange={() => setSelectedTier('clip_only')}
                                        className="audio-tier-card-input"
                                    />
                                    <span className="audio-tier-card-title">Video sound only</span>
                                    <span className="audio-tier-card-desc">Only your video&apos;s original sound is used. No extra voiceover.</span>
                                    <span className="audio-tier-card-price">₱{tiers.clipOnly} per frame</span>
                                </label>

                                <label className={`audio-tier-card ${selectedTier === 'clip_and_narrator' ? 'audio-tier-card-selected' : ''}`}>
                                    <input
                                        type="radio"
                                        name="pricingTier"
                                        value="clip_and_narrator"
                                        checked={selectedTier === 'clip_and_narrator'}
                                        onChange={() => setSelectedTier('clip_and_narrator')}
                                        className="audio-tier-card-input"
                                    />
                                    <span className="audio-tier-card-title">Video sound + voiceover</span>
                                    <span className="audio-tier-card-desc">Keep your video sound and add a narrator voice.</span>
                                    <span className="audio-tier-card-price">₱{tiers.clipAndNarrator} per frame</span>
                                </label>
                            </div>
                        </section>

                        <section className="pricing-page-section" aria-labelledby="pricing-duration-heading">
                            <h2 id="pricing-duration-heading" className="pricing-page-section-title">2. Enter your video length</h2>
                            <div className="field pricing-duration-controls">
                                <label className="label" htmlFor="pricing-duration-seconds">Video length (seconds)</label>
                                <input
                                    id="pricing-duration-seconds"
                                    type="number"
                                    min={0}
                                    max={7200}
                                    step={1}
                                    value={safeDurationSeconds}
                                    onChange={(e) => {
                                        const next = Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0
                                        setDurationSeconds(next)
                                    }}
                                />
                                <input
                                    type="range"
                                    min={0}
                                    max={600}
                                    step={5}
                                    value={Math.min(safeDurationSeconds, 600)}
                                    onChange={(e) => setDurationSeconds(Number(e.target.value))}
                                    className="pricing-duration-range"
                                    aria-label="Quick video length slider"
                                />
                                <p className="field-hint">Video length: <strong>{formatDuration(safeDurationSeconds)}</strong></p>
                            </div>
                        </section>
                    </div>

                    <section
                        className="pricing-page-section pricing-page-summary-section"
                        aria-labelledby="pricing-result-heading"
                    >
                        <h2 id="pricing-result-heading" className="pricing-page-section-title">3. Your estimated price</h2>
                        <div className="pricing-summary" aria-live="polite">
                            <div className="pricing-summary-row">
                                <span>Selected option</span>
                                <strong>{tierLabel(selectedTier)}</strong>
                            </div>
                            <div className="pricing-summary-row">
                                <span>Estimated words for this length</span>
                                <strong>{estimatedWords.toLocaleString()}</strong>
                            </div>
                            <div className="pricing-summary-row">
                                <span>Words per frame (average)</span>
                                <strong>{wordsPerFrame}</strong>
                            </div>
                            <div className="pricing-summary-row">
                                <span>Estimated total frames</span>
                                <strong>{estimatedFrames.toLocaleString()}</strong>
                            </div>
                            <div className="pricing-summary-row">
                                <span>Price per frame</span>
                                <strong>₱{selectedPricePerFrame.toLocaleString()}</strong>
                            </div>
                            <div className="pricing-summary-row pricing-summary-row-total">
                                <span>Estimated total price</span>
                                <strong>₱{estimatedTotalPesos.toLocaleString()}</strong>
                            </div>
                        </div>
                        <p className="pricing-note">
                            {loading
                                ? 'Loading latest pricing...'
                                : 'This is a quick estimate using current pricing and normal speaking speed (~2.5 words per second). Final price may change based on your final script.'}
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
