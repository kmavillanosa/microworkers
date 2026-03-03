import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ShowcaseCard, type ShowcaseItem } from './ShowcaseCard'

/** Base URL for API and media (no trailing slash). Empty = same origin (use proxy in dev). */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export default function ShowcasePage() {
  const [items, setItems] = useState<ShowcaseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const url = API_BASE ? `${API_BASE}/api/reels/showcase` : '/api/reels/showcase'
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load samples')
        return res.json()
      })
      .then((data: ShowcaseItem[]) => setItems(data))
      .catch(() => setError('Could not load samples.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="showcase-page">
        <div className="showcase-page-inner">
          <header className="showcase-page-header">
            <h1 className="showcase-page-title">Sample reels</h1>
            <p className="showcase-page-intro">Loading samples…</p>
          </header>
          <div className="showcase-grid showcase-grid-skeleton">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="showcase-card showcase-card-skeleton" aria-hidden>
                <div className="showcase-card-video-wrap" />
                <div className="showcase-card-title-skeleton" />
                <div className="showcase-card-desc-skeleton" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="showcase-page">
        <div className="showcase-page-inner">
          <div className="showcase-page-error">
            <p className="showcase-page-error-text">{error}</p>
            <Link to="/" className="landing-cta landing-cta-primary">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="showcase-page">
      <div className="showcase-page-inner">
        <header className="showcase-page-header">
          <h1 className="showcase-page-title">Sample reels</h1>
          <p className="showcase-page-intro">
            See what we can do. Each sample was made with our generator—script, voice, and style in minutes.
          </p>
        </header>
        {items.length === 0 ? (
          <div className="showcase-page-empty">
            <p className="showcase-page-empty-text">No samples yet. Check back soon.</p>
            <Link to="/order" className="landing-cta landing-cta-secondary">
              Create your first reel
            </Link>
          </div>
        ) : (
          <div className="showcase-grid">
            {items.map((item) => (
              <ShowcaseCard
                key={item.id}
                item={item}
                videoSrc={item.videoUrl.startsWith('http') ? item.videoUrl : `${API_BASE}${item.videoUrl}`}
                variant="page"
              />
            ))}
          </div>
        )}
        <div className="showcase-page-cta">
          <Link to="/order" className="landing-cta landing-cta-primary">
            Create your reel
          </Link>
        </div>
      </div>
    </div>
  )
}
