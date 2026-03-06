import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

/** API base (no trailing slash). Empty = same origin (works with http and https when served from same host). */
const API = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 120000
const SESSION_STORAGE_KEY = 'paymongo_checkout_session_id'

/**
 * Shown after PayMongo checkout success. Resolves checkout session to an order
 * then redirects to the receipt. Reads session id from URL query, sessionStorage,
 * or localStorage (set before redirect to PayMongo).
 */
export default function FromPaymentReceiptPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [message, setMessage] = useState<string>('Confirming your payment…')
  const [error, setError] = useState<string | null>(null)
  const [manualSessionId, setManualSessionId] = useState('')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const pollCountRef = useRef(0)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const fromQuery =
      searchParams.get('session_id') ??
      searchParams.get('checkout_session_id') ??
      searchParams.get('id')
    let sessionId: string | null = fromQuery
    if (!sessionId && typeof window !== 'undefined' && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      sessionId =
        hashParams.get('session_id') ??
        hashParams.get('checkout_session_id') ??
        hashParams.get('id') ??
        null
    }
    if (!sessionId) {
      try {
        sessionId =
          sessionStorage.getItem(SESSION_STORAGE_KEY) ??
          localStorage.getItem(SESSION_STORAGE_KEY)
      } catch {
        // ignore
      }
    }
    if (!sessionId?.trim()) {
      setError('Missing checkout session. If you just paid, your order was created; you can look it up below or check your email.')
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
            try {
              sessionStorage.removeItem(SESSION_STORAGE_KEY)
              localStorage.removeItem(SESSION_STORAGE_KEY)
            } catch {
              // ignore
            }
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

  async function handleLookupBySessionId(e: React.FormEvent) {
    e.preventDefault()
    const sid = manualSessionId.trim()
    if (!sid) return
    setLookupError(null)
    setMessage('Looking up your order…')
    setError(null)
    try {
      const res = await fetch(`${API}/api/orders/by-checkout-session/${encodeURIComponent(sid)}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.id) {
        navigate(`/receipt/${data.id}`, { replace: true })
        return
      }
      const apiMessage = typeof (data as { message?: string }).message === 'string'
        ? (data as { message: string }).message
        : null
      setLookupError(
        apiMessage ||
        'Order not found for this session. Check the ID (starts with cs_) or contact support.',
      )
      setError('Missing checkout session. If you just paid, your order was created; you can look it up below or check your email.')
    } catch {
      setLookupError('Lookup failed. Please try again or contact support.')
      setError('Missing checkout session. If you just paid, your order was created; you can look it up below or check your email.')
    }
  }

  if (error) {
    return (
      <div className="container receipt-container">
        <div className="card receipt-card">
          <p className="muted" role="alert" aria-live="assertive">{error}</p>
          <form onSubmit={handleLookupBySessionId} style={{ marginTop: '1rem' }}>
            <label htmlFor="receipt-session-id" className="label">
              Have your checkout session ID? (from payment confirmation or support)
            </label>
            <div className="field" style={{ marginBottom: '0.5rem' }}>
              <input
                id="receipt-session-id"
                type="text"
                placeholder="e.g. cs_xxxxxxxxxxxx"
                value={manualSessionId}
                onChange={(e) => setManualSessionId(e.target.value)}
                style={{ maxWidth: '320px' }}
              />
            </div>
            {lookupError ? (
              <p
                className="muted"
                role="alert"
                aria-live="assertive"
                style={{ marginTop: '0.25rem', color: 'var(--color-error, #dc2626)' }}
              >
                {lookupError}
              </p>
            ) : null}
            <p>
              <button type="submit" className="btn btn-primary" disabled={!manualSessionId.trim()}>
                Look up my order
              </button>
            </p>
          </form>
          <p style={{ marginTop: '1rem' }}>
            <Link to="/order" className="btn btn-secondary">Return to order</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container receipt-container">
      <div className="card receipt-card">
        <p className="muted" role="status" aria-live="polite">{message}</p>
      </div>
    </div>
  )
}
