import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

/** Base URL for API and media (no trailing slash). Empty = same origin (use proxy in dev). */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

interface ShowcaseItem {
  id: string
  videoUrl: string
  title: string
  description: string
}

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
        <div className="container">
          <p className="muted">Loading samples…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="showcase-page">
        <div className="container">
          <p className="muted">{error}</p>
          <Link to="/" className="btn landing-cta" style={{ marginTop: '1rem' }}>
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="showcase-page">
      <div className="container showcase-page-container">
        <h1 className="showcase-page-title">Sample reels</h1>
        <p className="showcase-page-intro">
          See what we can do. Each sample was made with our generator—script, voice, and style in minutes.
        </p>
        {items.length === 0 ? (
          <p className="muted">No samples yet. Check back soon.</p>
        ) : (
          <div className="showcase-grid">
            {items.map((item) => (
              <article key={item.id} className="showcase-card">
                <div className="showcase-card-video-wrap">
                  <video
                    src={item.videoUrl.startsWith('http') ? item.videoUrl : `${API_BASE}${item.videoUrl}`}
                    controls
                    playsInline
                    preload="metadata"
                    className="showcase-card-video"
                  />
                </div>
                <h3 className="showcase-card-title">{item.title}</h3>
                {item.description ? (
                  <p className="showcase-card-desc">{item.description}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
        <div className="showcase-page-cta">
          <Link to="/order" className="btn landing-cta">
            Create your reel
          </Link>
        </div>
      </div>
    </div>
  )
}
