import { Routes, Route, Link } from 'react-router-dom'
import Landing from './Landing'
import OrderPage from './OrderPage'
import ReceiptPage from './ReceiptPage'
import FromPaymentReceiptPage from './FromPaymentReceiptPage'
import ShowcasePage from './ShowcasePage'
import PricingPage from './PricingPage'
import FaqPage from './FaqPage'

function App() {
  return (
    <div className="app-wrap">
      <nav className="app-nav">
        <Link to="/" className="app-nav-brand" aria-label="ReelAgad home">
          <img src="/logo.svg" alt="" className="app-nav-logo" width="288" height="77" />
        </Link>
        <Link to="/showcase" className="app-nav-link">See our work</Link>
        <Link to="/pricing" className="app-nav-link">Pricing</Link>
        <Link to="/faq" className="app-nav-link">FAQ</Link>
        <Link to="/order" className="app-nav-link app-nav-cta">Order now</Link>
      </nav>
      <main className="app-main">
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
