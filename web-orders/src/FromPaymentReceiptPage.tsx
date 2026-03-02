import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3010'
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 120000

/**
 * Shown after PayMongo checkout success. Resolves checkout session to an order
 * (created by webhook) then redirects to the receipt. Reads session id from
 * sessionStorage (set before redirect to PayMongo) or from URL query.
 */
export default function FromPaymentReceiptPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [message, setMessage] = useState<string>('Confirming your payment…')
  const [error, setError] = useState<string | null>(null)
  const pollCountRef = useRef(0)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const fromQuery = searchParams.get('session_id') ?? searchParams.get('checkout_session_id')
    let sessionId: string | null = fromQuery
    if (!sessionId) {
      try {
        sessionId = sessionStorage.getItem('paymongo_checkout_session_id')
        if (sessionId) sessionStorage.removeItem('paymongo_checkout_session_id')
      } catch {
        // ignore
      }
    }

    if (!sessionId?.trim()) {
      setError('Missing checkout session. If you just paid, your order was created; check your email or contact support.')
      return
    }

    const timeout = window.setTimeout(() => {
      setError('Taking longer than usual. Your payment may still have gone through. Check your email or contact support.')
    }, POLL_TIMEOUT_MS)

    let cancelled = false
    const poll = async () => {
      if (cancelled) return
      pollCountRef.current += 1
      if (pollCountRef.current > 1) {
        setMessage(`Confirming your payment… (${pollCountRef.current})`)
      }
      try {
        const res = await fetch(`${API}/api/orders/by-checkout-session/${encodeURIComponent(sessionId!)}`)
        if (cancelled) return
        if (res.ok) {
          const order = await res.json()
          if (order?.id) {
            window.clearTimeout(timeout)
            navigate(`/receipt/${order.id}`, { replace: true })
            return
          }
        }
      } catch {
        // continue polling
      }
      if (!cancelled) {
        pollTimeoutRef.current = window.setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    poll()
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
      if (pollTimeoutRef.current != null) {
        window.clearTimeout(pollTimeoutRef.current)
        pollTimeoutRef.current = null
      }
    }
  }, [searchParams, navigate])

  if (error) {
    return (
      <div className="container receipt-container">
        <div className="card receipt-card">
          <p className="muted">{error}</p>
          <p>
            <Link to="/order" className="btn btn-primary">Return to order</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container receipt-container">
      <div className="card receipt-card">
        <p className="muted">{message}</p>
      </div>
    </div>
  )
}
