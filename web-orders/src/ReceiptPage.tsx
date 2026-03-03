import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'

/** API base (no trailing slash). Empty = same origin (works with both http and https). */
const API = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '') || 'http://localhost:3010'

type OrderStatus = 'pending' | 'accepted' | 'declined' | 'processing' | 'ready_for_sending' | 'closed'

interface Order {
  id: string
  customerName: string
  customerEmail: string
  deliveryAddress: string
  script: string
  title: string | null
  fontId: string
  clipName: string | null
  voiceEngine: string
  voiceName: string
  bankCode: string | null
  paymentReference: string | null
  paymentStatus: 'pending' | 'confirmed'
  orderStatus: OrderStatus
  createdAt: string
}

interface ReelItem {
  id: string
  folder: string
  createdAt: string
  videoUrl: string
  srtUrl: string
  txtUrl: string
  audioUrl?: string
  orderId?: string
}

function isCustomFontFile(fontId: string): boolean {
  const lower = fontId.toLowerCase()
  return lower.endsWith('.ttf') || lower.endsWith('.otf')
}

function fontFamilyFor(fontId: string): string {
  if (!fontId) return 'inherit'
  if (isCustomFontFile(fontId)) {
    return `"OrderFont-${fontId.replace(/[^a-z0-9.-]/gi, '_')}", sans-serif`
  }
  const lower = fontId.toLowerCase()
  if (lower === 'default') return 'system-ui, sans-serif'
  return `"${fontId}", sans-serif`
}

function clipPreviewUrlFor(order: Order): string | null {
  if (!order.clipName) return null
  const name = order.clipName
  if (name.startsWith('order-')) {
    return `${API}/media/order-clips/${encodeURIComponent(name)}`
  }
  return `${API}/media/clips/${encodeURIComponent(name)}`
}

function orderStatusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    pending: 'Pending',
    accepted: 'Accepted',
    declined: 'Declined',
    processing: 'In progress',
    ready_for_sending: 'Ready for delivery',
    closed: 'Completed',
  }
  return labels[status] ?? status
}

function isOrderCompleted(order: Order): boolean {
  return order.orderStatus === 'ready_for_sending' || order.orderStatus === 'closed'
}

/** Trigger a real download (fetch + blob) so the file downloads instead of opening in a new tab. */
function triggerDownload(url: string, suggestedName: string) {
  const fullUrl = url.startsWith('http') ? url : `${API}${url}`
  fetch(fullUrl)
    .then((r) => {
      if (!r.ok) throw new Error('Download failed')
      return r.blob()
    })
    .then((blob) => {
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = suggestedName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objUrl)
    })
    .catch(() => {
      window.open(fullUrl, '_blank', 'noopener,noreferrer')
    })
}

export default function ReceiptPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [reels, setReels] = useState<ReelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!orderId) {
      setLoading(false)
      return
    }
    fetch(`${API}/api/orders/${orderId}`)
      .then((r) => {
        if (!r.ok) throw new Error('Order not found')
        return r.json()
      })
      .then((data: Order) => {
        setOrder(data)
        if (isOrderCompleted(data)) {
          return fetch(`${API}/api/orders/${orderId}/reels`)
            .then((res) => (res.ok ? res.json() : []))
            .then((list: ReelItem[]) => setReels(Array.isArray(list) ? list : []))
            .catch(() => setReels([]))
        }
      })
      .catch(() => setError('Order not found or link expired.'))
      .finally(() => setLoading(false))
  }, [orderId])

  function handlePrint() {
    window.print()
  }

  if (loading) {
    return (
      <div className="container receipt-container">
        <div className="card receipt-card">
          <p className="muted">Loading receipt…</p>
        </div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="container receipt-container">
        <div className="card receipt-card">
          <p style={{ color: '#dc2626' }}>{error || 'Invalid order reference.'}</p>
          <Link to="/" className="btn btn-secondary" style={{ display: 'inline-block', marginTop: '1rem' }}>Back to home</Link>
        </div>
      </div>
    )
  }

  const createdDate = new Date(order.createdAt).toLocaleString(undefined, {
    dateStyle: 'long',
    timeStyle: 'short',
  })

  const clipPreviewUrl = clipPreviewUrlFor(order)
  const previewText = order.script
    .trim()
    .split(/\s+/)
    .slice(0, 24)
    .join(' ')

  return (
    <div className="container receipt-container">
      <div className="card receipt-card no-print-actions">
        <div className="receipt-actions">
          <button type="button" className="btn" onClick={handlePrint}>
            Print / Save as PDF
          </button>
          <Link to="/" className="btn btn-secondary">Back to home</Link>
        </div>
      </div>

      <div className="card receipt-card" id="receipt-content">
        <h1 className="receipt-title">Order receipt</h1>
        <p className="receipt-subtitle">
          Save this page or print it for your records. Use the <strong>Order reference</strong> below if you need support.
        </p>

        <section className="receipt-section">
          <h2 className="receipt-section-title">Order reference</h2>
          <p className="receipt-order-id">{order.id}</p>
          <p className="muted">Order date: {createdDate}</p>
          <p className="receipt-status-line">
            <strong>Order status:</strong>{' '}
            <span className="receipt-order-status" data-status={order.orderStatus ?? 'pending'}>
              {orderStatusLabel((order.orderStatus ?? 'pending') as OrderStatus)}
            </span>
          </p>
        </section>

        {(order.customerName || order.customerEmail || order.deliveryAddress) && (
          <section className="receipt-section">
            <h2 className="receipt-section-title">Customer & delivery</h2>
            {order.customerName && <p><strong>{order.customerName}</strong></p>}
            {order.customerEmail && <p>{order.customerEmail}</p>}
            {order.deliveryAddress && <p className="receipt-address">{order.deliveryAddress}</p>}
          </section>
        )}

        <section className="receipt-section">
          <h2 className="receipt-section-title">Your reel</h2>
          {order.title && <p><strong>Title:</strong> {order.title}</p>}
          <p><strong>Font:</strong> {order.fontId}</p>
          <p><strong>Voice:</strong> {order.voiceName} ({order.voiceEngine})</p>
          {order.clipName ? <p><strong>Background clip:</strong> {order.clipName}</p> : <p><strong>Background:</strong> Caption style</p>}
          <div className="receipt-script">
            <strong>Script:</strong>
            <pre>{order.script}</pre>
          </div>
          <div className="receipt-preview-wrapper">
            {isCustomFontFile(order.fontId) && (
              <style>{`
                @font-face {
                  font-family: "OrderFont-${order.fontId.replace(/[^a-z0-9.-]/gi, '_')}";
                  src: url("${API}/media/fonts/${encodeURIComponent(order.fontId)}");
                }
              `}
              </style>
            )}
            <div className="order-preview-frame receipt-preview-frame">
              {clipPreviewUrl ? (
                <video
                  src={clipPreviewUrl}
                  muted
                  loop
                  playsInline
                  autoPlay
                />
              ) : (
                <div className="preview-caption-bg" />
              )}
              <div
                className="order-preview-overlay"
                style={{ fontFamily: fontFamilyFor(order.fontId) }}
              >
                <div className="order-preview-title">
                  {order.title?.trim() || 'Your title'}
                </div>
                <div className="order-preview-caption" title={order.script.trim()}>
                  {previewText || 'Your script will appear here'}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="receipt-section">
          <h2 className="receipt-section-title">Payment</h2>
          <p><strong>Status:</strong> {order.paymentStatus === 'confirmed' ? '✓ Confirmed' : 'Pending'}</p>
          {order.paymentStatus === 'confirmed' && (
            <>
              {order.bankCode && <p><strong>Bank:</strong> {order.bankCode}</p>}
              {order.paymentReference && <p><strong>Reference:</strong> {order.paymentReference}</p>}
            </>
          )}
        </section>

        {isOrderCompleted(order) && reels.length > 0 && (
          <section className="receipt-section receipt-downloads">
            <h2 className="receipt-section-title">Downloads</h2>
            <p className="muted small">Your completed reel files. Click to download.</p>
            {reels.map((reel, index) => (
              <div key={reel.id} className="receipt-download-group">
                {reels.length > 1 && (
                  <p className="receipt-download-reel-label">Reel {index + 1}</p>
                )}
                <div className="receipt-download-links">
                  <button
                    type="button"
                    className="btn btn-secondary receipt-download-btn"
                    onClick={() => triggerDownload(reel.videoUrl, `reel${reels.length > 1 ? `-${index + 1}` : ''}.mp4`)}
                  >
                    Download video
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary receipt-download-btn"
                    onClick={() => triggerDownload(reel.txtUrl, `reel${reels.length > 1 ? `-${index + 1}` : ''}.txt`)}
                  >
                    Download script
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary receipt-download-btn"
                    onClick={() => triggerDownload(reel.srtUrl, `reel${reels.length > 1 ? `-${index + 1}` : ''}.srt`)}
                  >
                    Download SRT
                  </button>
                  {reel.audioUrl && (
                    <button
                      type="button"
                      className="btn btn-secondary receipt-download-btn"
                      onClick={() => triggerDownload(reel.audioUrl!, `reel${reels.length > 1 ? `-${index + 1}` : ''}-audio.wav`)}
                    >
                      Download audio
                    </button>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}

        <p className="receipt-footer muted">
          Thank you for your order. We will deliver your reel to the email and address above. Contact us with your order reference if you have any questions.
        </p>
      </div>
    </div>
  )
}
