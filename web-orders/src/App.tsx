import { useEffect, useState } from 'react'
import { Routes, Route, Link, NavLink, useLocation } from 'react-router-dom'
import Landing from './Landing'
import OrderPage from './OrderPage'
import ReceiptPage from './ReceiptPage'
import FromPaymentReceiptPage from './FromPaymentReceiptPage'
import ShowcasePage from './ShowcasePage'
import PricingPage from './PricingPage'
import FaqPage from './FaqPage'
import { SeoManager } from './SeoManager'

const API = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

type MaintainanceModeResponse = {
  isOnMaintainanceMode?: boolean
}

function App() {
  const location = useLocation()
  const isLandingRoute = location.pathname === '/'
  const [isOnMaintainanceMode, setIsOnMaintainanceMode] = useState(false)

  useEffect(() => {
    let active = true

    const syncMaintainanceMode = async () => {
      try {
        const response = await fetch(`${API}/api/settings/maintenance-mode`)
        if (!response.ok || !active) {
          return
        }

        const data = (await response.json()) as MaintainanceModeResponse
        if (!active) {
          return
        }

        setIsOnMaintainanceMode(data.isOnMaintainanceMode === true)
      } catch {
        // keep previous state
      }
    }

    void syncMaintainanceMode()

    return () => {
      active = false
    }
  }, [])

  if (isOnMaintainanceMode) {
    return (
      <>
        <SeoManager />
        <div className="maintenance-mode-screen" role="alert" aria-live="assertive">
          <div className="maintenance-mode-card">
            <h1 className="maintenance-mode-title">We&rsquo;re under maintenance</h1>
            <p className="maintenance-mode-message">
              ReelAgad is temporarily unavailable while we perform system maintenance.
            </p>
            <p className="maintenance-mode-message">
              Please check back again in a few minutes.
            </p>
          </div>
        </div>
      </>
    )
  }

  return (
    <div className={`app-wrap${isLandingRoute ? ' app-wrap-landing' : ''}`}>
      <SeoManager />
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <nav className="app-nav" aria-label="Primary navigation">
        <Link to="/" className="app-nav-brand" aria-label="ReelAgad home">
          <img src="/logo.svg" alt="" className="app-nav-logo" width="288" height="77" />
        </Link>
        <NavLink to="/showcase" className="app-nav-link">See our work</NavLink>
        <NavLink to="/pricing" className="app-nav-link">Pricing</NavLink>
        <NavLink to="/faq" className="app-nav-link">FAQ</NavLink>
      </nav>
      <main id="main-content" className="app-main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/showcase" element={<ShowcasePage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/order" element={<OrderPage />} />
          <Route path="/receipt/from-payment" element={<FromPaymentReceiptPage />} />
          <Route path="/receipt/:orderId" element={<ReceiptPage />} />
        </Routes>
      </main>
      <footer className="app-footer">
        <div className="app-footer-inner">
          <Link to="/" className="app-footer-brand" aria-label="ReelAgad home">
            <img src="/logo.svg" alt="" className="app-footer-logo" width="288" height="77" />
          </Link>
          <nav className="app-footer-links" aria-label="Footer navigation">
            <Link to="/">Home</Link>
            <Link to="/showcase">Sample videos</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/faq">FAQ</Link>
            <Link to="/order">Order now</Link>
          </nav>
          <p className="app-footer-copy">
            Captions & voiceover on demand. Turn your script or clip into a polished reel.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
