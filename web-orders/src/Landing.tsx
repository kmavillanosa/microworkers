import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ShowcaseCard, type ShowcaseItem } from './ShowcaseCard'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

const LANDING_SHOWCASE_MAX = 6

export default function Landing() {
  const [showcaseItems, setShowcaseItems] = useState<ShowcaseItem[]>([])
  const [showcaseLoading, setShowcaseLoading] = useState(true)

  useEffect(() => {
    const url = API_BASE ? `${API_BASE}/api/reels/showcase` : '/api/reels/showcase'
    fetch(url)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ShowcaseItem[]) => setShowcaseItems(Array.isArray(data) ? data : []))
      .catch(() => setShowcaseItems([]))
      .finally(() => setShowcaseLoading(false))
  }, [])

  const displaySamples = showcaseItems.slice(0, LANDING_SHOWCASE_MAX)

  return (
    <div className="landing-page">
      <header className="landing-hero">
        <span className="landing-hero-badge">Captions & voiceover on demand</span>
        <h1 className="landing-hero-title">
          Turn your script—or your raw clip—into a polished reel in minutes.
        </h1>
        <p className="landing-hero-sub">
          Pick your style, voice, and format. We add captions, narration, and delivery in the size you need. No editing skills required.
        </p>
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
          <h2 className="landing-section-title">Sample reels</h2>
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
          <h2 id="landing-showcase-title" className="landing-section-title">Sample reels</h2>
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
          <li><strong>Captions and narration that match your brand.</strong> Choose fonts and AI voices, or use your clip’s own audio.</li>
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

      <section className="landing-footer-cta">
        <p className="landing-footer-text">Ready for a reel that looks pro and that people actually want to watch?</p>
        <Link to="/order" className="landing-cta landing-cta-primary">
          Get started
        </Link>
      </section>
    </div>
  )
}
