import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ShowcaseCard, type ShowcaseItem } from './ShowcaseCard'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

const LANDING_SHOWCASE_MAX = 6

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

function BetaBadge() {
  return <span className="landing-beta-badge">BETA</span>
}

export default function Landing() {
  const [showcaseItems, setShowcaseItems] = useState<ShowcaseItem[]>([])
  const [showcaseLoading, setShowcaseLoading] = useState(true)
  const [pricingLoading, setPricingLoading] = useState(true)
  const [pricingError, setPricingError] = useState('')
  const [pricingTier, setPricingTier] = useState<PricingTierId>('tts_only')
  const [durationSeconds, setDurationSeconds] = useState(30)
  const [wordsPerFrame, setWordsPerFrame] = useState(DEFAULT_PRICING.wordsPerFrame)
  const [tiers, setTiers] = useState(DEFAULT_PRICING.pricePerFramePesosByTier)

  useEffect(() => {
    const url = API_BASE ? `${API_BASE}/api/reels/showcase` : '/api/reels/showcase'
    fetch(url)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ShowcaseItem[]) => setShowcaseItems(Array.isArray(data) ? data : []))
      .catch(() => setShowcaseItems([]))
      .finally(() => setShowcaseLoading(false))
  }, [])

  useEffect(() => {
    let isCancelled = false
    const url = API_BASE ? `${API_BASE}/api/orders/pricing` : '/api/orders/pricing'
    fetch(url)
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
        setPricingError('Could not load live pricing. Showing default values.')
      })
      .finally(() => {
        if (!isCancelled) setPricingLoading(false)
      })

    return () => {
      isCancelled = true
    }
  }, [])

  const displaySamples = showcaseItems.slice(0, LANDING_SHOWCASE_MAX)
  const safeDurationSeconds = Math.max(0, Math.min(7200, Math.floor(durationSeconds || 0)))
  const estimatedWords = useMemo(
    () => Math.max(0, Math.floor(safeDurationSeconds * WORDS_PER_SECOND)),
    [safeDurationSeconds],
  )
  const estimatedFrames = useMemo(
    () => (wordsPerFrame > 0 ? Math.ceil(estimatedWords / wordsPerFrame) : 0),
    [estimatedWords, wordsPerFrame],
  )
  const selectedPricePerFrame = selectedTierPrice(pricingTier, tiers)
  const estimatedTotalPesos = estimatedFrames * selectedPricePerFrame

  return (
    <div className="landing-page">
      <header className="landing-hero">
        <span className="landing-hero-badge">
          <BetaBadge />
          <span>{" "}We are now live!</span>
        </span>
        <h1 className="landing-hero-title">
          One script. One click. One powerful reel.
        </h1>
        <p className="landing-hero-sub">
          Pick your style, voice, and format. We add captions, narration, and delivery in the size you need. No editing skills required.
        </p>
        <div className="landing-hero-proof" role="list" aria-label="Benefits">
          <span role="listitem">Fast turnaround</span>
          <span role="listitem">Captions + narration</span>
          <span role="listitem">Phone, tablet, laptop, desktop</span>
        </div>
        <div className="landing-hero-actions">
          <Link to="/order" className="landing-cta landing-cta-primary">
            Create your reel
          </Link>
          <Link to="/showcase" className="landing-cta landing-cta-secondary">
            View samples
          </Link>
        </div>
      </header>

      {showcaseLoading && (
        <section className="landing-section landing-showcase" aria-busy="true">
          <h2 className="landing-section-title">Sample videos we generated</h2>
          <div className="landing-showcase-grid landing-showcase-skeleton">
            {[1, 2, 3].map((i) => (
              <div key={i} className="landing-showcase-card landing-showcase-card-skeleton" aria-hidden>
                <div className="landing-showcase-card-video-wrap" />
                <div className="landing-showcase-card-title-skeleton" />
                <div className="landing-showcase-card-desc-skeleton" />
              </div>
            ))}
          </div>
        </section>
      )}
      {!showcaseLoading && displaySamples.length > 0 && (
        <section className="landing-section landing-showcase" aria-labelledby="landing-showcase-title">
          <h2 id="landing-showcase-title" className="landing-section-title">Sample videos we generated</h2>
          <p className="landing-section-intro">
            See what we can do. Each sample was made with our generator.
          </p>
          <div className="landing-showcase-grid">
            {displaySamples.map((item) => (
              <ShowcaseCard
                key={item.id}
                item={item}
                videoSrc={item.videoUrl.startsWith('http') ? item.videoUrl : `${API_BASE}${item.videoUrl}`}
                variant="landing"
              />
            ))}
          </div>
          {(showcaseItems.length > LANDING_SHOWCASE_MAX || (showcaseItems.length > 0 && showcaseItems.length <= LANDING_SHOWCASE_MAX)) && (
            <p className="landing-showcase-more">
              <Link to="/showcase" className="landing-showcase-more-link">
                {showcaseItems.length > LANDING_SHOWCASE_MAX ? `See all ${showcaseItems.length} samples` : 'View all samples'}
                <span className="landing-arrow" aria-hidden>→</span>
              </Link>
            </p>
          )}
        </section>
      )}

      <section className="landing-section landing-problem" aria-labelledby="landing-problem-title">
        <h2 id="landing-problem-title" className="landing-section-title">We solve the stuff that gets in the way</h2>
        <ul className="landing-list landing-problem-list">
          <li><strong>No time to edit.</strong> You have the idea and the footage; we handle the rest.</li>
          <li><strong>Captions and narration that match your brand.</strong> Choose fonts and voices, or use your clip’s own audio.</li>
          <li><strong>One format doesn’t fit all.</strong> Get your reel in phone, tablet, laptop, or desktop aspect ratio—for Reels, Shorts, TikTok, or feed.</li>
          <li><strong>No software to learn.</strong> Upload, choose options, pay—we deliver the file to you.</li>
          <li><strong>Don’t make boring corporate video.</strong> Skip the generic conference-room look—make reels your prospects actually want to watch.</li>
        </ul>
      </section>

      <section className="landing-section landing-audience" aria-labelledby="landing-audience-title">
        <h2 id="landing-audience-title" className="landing-section-title">Built for people who create, not for editors</h2>
        <p className="landing-section-intro">
          For anyone who wants to show up on short-form video without spending hours in an editor—and without the usual boring B2B look:
        </p>
        <ul className="landing-list landing-audience-list">
          <li>Creators and influencers who’d rather focus on ideas than on timelines and keyframes</li>
          <li>Small business and B2B teams who need reels that prospects actually want to watch—not the same old stock footage</li>
          <li>Educators and coaches turning long content into bite-sized clips with clear captions and voiceover</li>
          <li>Anyone with a script or a clip who wants a finished reel delivered—fast and simple</li>
        </ul>
      </section>

      <section className="landing-section landing-how" aria-labelledby="landing-how-title">
        <h2 id="landing-how-title" className="landing-section-title">How it works</h2>
        <ol className="landing-steps">
          <li><span className="landing-step-num">1</span> Paste your script or upload a video—we can transcribe it and use that as the script.</li>
          <li><span className="landing-step-num">2</span> Choose font, background clip (or use yours), voice, and output size (phone, tablet, laptop, or desktop).</li>
          <li><span className="landing-step-num">3</span> Pay securely; we generate your reel and deliver the video, script, SRT, and audio to your receipt.</li>
        </ol>
        <div className="landing-how-cta">
          <Link to="/order" className="landing-cta landing-cta-secondary">
            Place your order
          </Link>
        </div>
      </section>

      <section className="landing-section landing-pricing" aria-labelledby="landing-pricing-title">
        <h2 id="landing-pricing-title" className="landing-section-title">Pricing calculator</h2>
        <p className="landing-section-intro">
          Get a quick estimate based on your audio option and video length.
        </p>

        {pricingError && <p className="pricing-alert">{pricingError}</p>}

        <div className="landing-pricing-grid">
          <div className="landing-pricing-inputs">
            <div className="audio-tier-cards landing-pricing-tier-cards" role="radiogroup" aria-label="Select audio option for estimate">
              <label className={`audio-tier-card ${pricingTier === 'tts_only' ? 'audio-tier-card-selected' : ''}`}>
                <input
                  type="radio"
                  name="landingPricingTier"
                  value="tts_only"
                  checked={pricingTier === 'tts_only'}
                  onChange={() => setPricingTier('tts_only')}
                  className="audio-tier-card-input"
                />
                <span className="audio-tier-card-title">Voiceover only</span>
                <span className="audio-tier-card-desc">Only our narrator voice is used. Your video sound is muted.</span>
                <span className="audio-tier-card-price">₱{tiers.ttsOnly} per frame</span>
              </label>

              <label className={`audio-tier-card ${pricingTier === 'clip_only' ? 'audio-tier-card-selected' : ''}`}>
                <input
                  type="radio"
                  name="landingPricingTier"
                  value="clip_only"
                  checked={pricingTier === 'clip_only'}
                  onChange={() => setPricingTier('clip_only')}
                  className="audio-tier-card-input"
                />
                <span className="audio-tier-card-title">Video sound only</span>
                <span className="audio-tier-card-desc">Only your video&apos;s original sound is used. No extra voiceover.</span>
                <span className="audio-tier-card-price">₱{tiers.clipOnly} per frame</span>
              </label>

              <label className={`audio-tier-card ${pricingTier === 'clip_and_narrator' ? 'audio-tier-card-selected' : ''}`}>
                <input
                  type="radio"
                  name="landingPricingTier"
                  value="clip_and_narrator"
                  checked={pricingTier === 'clip_and_narrator'}
                  onChange={() => setPricingTier('clip_and_narrator')}
                  className="audio-tier-card-input"
                />
                <span className="audio-tier-card-title">Video sound + voiceover</span>
                <span className="audio-tier-card-desc">Keep your video sound and add a narrator voice.</span>
                <span className="audio-tier-card-price">₱{tiers.clipAndNarrator} per frame</span>
              </label>
            </div>

            <div className="field landing-pricing-duration">
              <label className="label" htmlFor="landing-pricing-duration">Video length (seconds)</label>
              <input
                id="landing-pricing-duration"
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
          </div>

          <div className="pricing-summary" aria-live="polite">
            <div className="pricing-summary-row">
              <span>Selected option</span>
              <strong>{tierLabel(pricingTier)}</strong>
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
        </div>

        <p className="pricing-note">
          {pricingLoading
            ? 'Loading latest pricing...'
            : 'This is a quick estimate using current pricing and normal speaking speed (~2.5 words per second). Final price may change based on your final script.'}
        </p>
      </section>

      <section className="landing-footer-cta">
        <p className="landing-footer-text">Ready for a reel that looks pro and that people actually want to watch?</p>
        <Link to="/order" className="landing-cta landing-cta-primary">
          Get started
        </Link>
      </section>
    </div>
  )
}
