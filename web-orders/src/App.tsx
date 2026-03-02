import { Routes, Route, Link } from 'react-router-dom'
import Landing from './Landing'
import OrderPage from './OrderPage'
import ReceiptPage from './ReceiptPage'
import ShowcasePage from './ShowcasePage'

function App() {
  return (
    <>
      <nav className="app-nav">
        <Link to="/" className="app-nav-brand">ReelAgad</Link>
        <Link to="/showcase" className="app-nav-link">Samples</Link>
        <Link to="/order" className="app-nav-link app-nav-cta">Order now</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/showcase" element={<ShowcasePage />} />
        <Route path="/order" element={<OrderPage />} />
        <Route path="/receipt/:orderId" element={<ReceiptPage />} />
      </Routes>
    </>
  )
}

export default App
