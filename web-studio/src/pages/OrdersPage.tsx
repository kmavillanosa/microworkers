import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Card } from 'flowbite-react'
import { studioApi } from '../api/studioApi'
import type {
    Order,
    OrderAudioFilter,
    OrdersPageResponse,
    OrderStatus,
    StudioBootstrap,
} from '../api/types'

type OrdersPageProps = {
    orderPricing: StudioBootstrap['orderPricing']
    reels: StudioBootstrap['reels']
    reelJobs: StudioBootstrap['reelJobs']
    processingOrderIds: Record<string, boolean>
    deletingOrderId: string | null
    orderActionMessage: string | null
    onProcessOrder: (orderId: string) => Promise<void> | void
    onDeleteOrder: (orderId: string) => Promise<void> | void
}

const DEFAULT_WEB_ORDERS_BASE_URL = 'https://reelagad.com'
const LOCAL_WEB_ORDERS_BASE_URL = 'https://reelagad.com'
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0]

const ORDER_STATUS_ORDER: OrderStatus[] = [
    'pending',
    'accepted',
    'processing',
    'ready_for_sending',
    'closed',
    'declined',
]

type AudioFilter = 'all' | OrderAudioFilter
type PaymentFilter = 'all' | Order['paymentStatus']
type StatusFilter = 'all' | OrderStatus

const EMPTY_PAGED_ORDERS: OrdersPageResponse = {
    items: [],
    total: 0,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalPages: 1,
}

function resolveWebOrdersBaseUrl(): string {
    const configured = (import.meta.env.VITE_WEB_ORDERS_BASE_URL as string | undefined)?.trim()
    if (configured) {
        return configured.replace(/\/+$/, '')
    }

    if (typeof window !== 'undefined') {
        const host = window.location.hostname
        if (host === 'localhost' || host === '127.0.0.1') {
            return LOCAL_WEB_ORDERS_BASE_URL
        }
    }

    return DEFAULT_WEB_ORDERS_BASE_URL
}

const WEB_ORDERS_BASE_URL = resolveWebOrdersBaseUrl()

function formatStatusLabel(status: OrderStatus): string {
    if (status === 'ready_for_sending') {
        return 'Ready for sending'
    }

    return status.replace(/_/g, ' ')
}

function formatCurrency(value: number): string {
    return `₱${value.toLocaleString()}`
}

function canProcessVideo(orderStatus: OrderStatus): boolean {
    return orderStatus !== 'closed' && orderStatus !== 'ready_for_sending' && orderStatus !== 'processing'
}

function resolveAudioMode(order: Order): OrderAudioFilter {
    if (order.useClipAudioWithNarrator) {
        return 'clip_and_narrator'
    }

    if (order.useClipAudio) {
        return 'clip_only'
    }

    return 'tts_only'
}

function formatAudioMode(mode: OrderAudioFilter): string {
    if (mode === 'clip_and_narrator') {
        return 'Clip + narrator'
    }

    if (mode === 'clip_only') {
        return 'Clip only'
    }

    return 'TTS only'
}

function calculateFramesAndPrice(order: Order, orderPricing: StudioBootstrap['orderPricing']) {
    const words = order.script.trim().split(/\s+/).filter(Boolean).length
    const wordsPerFrame = Math.max(1, orderPricing?.wordsPerFrame ?? 4)
    const frames = Math.max(1, Math.ceil(words / wordsPerFrame))

    const tiers = orderPricing?.pricePerFramePesosByTier
    const ttsOnlyPrice = tiers?.ttsOnly ?? orderPricing?.pricePerFramePesos ?? 0
    const clipOnlyPrice = tiers?.clipOnly ?? orderPricing?.clipOnly ?? ttsOnlyPrice
    const clipAndNarratorPrice =
        tiers?.clipAndNarrator ?? orderPricing?.clipAndNarrator ?? ttsOnlyPrice

    let pricePerFrame = ttsOnlyPrice
    if (order.useClipAudioWithNarrator) {
        pricePerFrame = clipAndNarratorPrice
    } else if (order.useClipAudio) {
        pricePerFrame = clipOnlyPrice
    }

    return {
        frames,
        totalPrice: Math.round(frames * pricePerFrame * 100) / 100,
    }
}

function formatOrderIdForTable(orderId: string): string {
    if (orderId.length <= 12) {
        return orderId
    }

    return orderId.slice(-12)
}

export function OrdersPage({
    orderPricing,
    reels,
    reelJobs,
    processingOrderIds,
    deletingOrderId,
    orderActionMessage,
    onProcessOrder,
    onDeleteOrder,
}: OrdersPageProps) {
    const [searchInput, setSearchInput] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all')
    const [audioFilter, setAudioFilter] = useState<AudioFilter>('all')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
    const [ordersPage, setOrdersPage] = useState<OrdersPageResponse>(EMPTY_PAGED_ORDERS)
    const [loadingOrders, setLoadingOrders] = useState(false)
    const [ordersError, setOrdersError] = useState<string | null>(null)
    const [reloadToken, setReloadToken] = useState(0)

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setSearchQuery(searchInput.trim())
        }, 250)

        return () => {
            window.clearTimeout(timeoutId)
        }
    }, [searchInput])

    const refreshOrders = useCallback(() => {
        setReloadToken((current) => current + 1)
    }, [])

    useEffect(() => {
        let cancelled = false

        setLoadingOrders(true)
        setOrdersError(null)

        void studioApi
            .listOrdersPaged({
                page,
                pageSize,
                search: searchQuery || undefined,
                status: statusFilter === 'all' ? undefined : statusFilter,
                paymentStatus: paymentFilter === 'all' ? undefined : paymentFilter,
                audio: audioFilter === 'all' ? undefined : audioFilter,
            })
            .then((result) => {
                if (cancelled) {
                    return
                }

                const normalizedTotalPages = Math.max(1, result.totalPages)
                if (page > normalizedTotalPages) {
                    setPage(normalizedTotalPages)
                    return
                }

                setOrdersPage({
                    ...result,
                    totalPages: normalizedTotalPages,
                })
            })
            .catch(() => {
                if (cancelled) {
                    return
                }

                setOrdersError('Failed to load orders.')
            })
            .finally(() => {
                if (cancelled) {
                    return
                }

                setLoadingOrders(false)
            })

        return () => {
            cancelled = true
        }
    }, [audioFilter, page, pageSize, paymentFilter, reloadToken, searchQuery, statusFilter])

    const pageOrders = ordersPage.items
    const totalMatchingOrders = ordersPage.total
    const totalPages = Math.max(1, ordersPage.totalPages)

    const hasActiveFilters =
        searchInput.trim().length > 0 || statusFilter !== 'all' || paymentFilter !== 'all' || audioFilter !== 'all'

    const statusCounts = useMemo(() => {
        const counts: Record<OrderStatus, number> = {
            pending: 0,
            accepted: 0,
            declined: 0,
            processing: 0,
            ready_for_sending: 0,
            closed: 0,
        }

        pageOrders.forEach((order) => {
            counts[order.orderStatus] += 1
        })

        return counts
    }, [pageOrders])

    const totalEstimatedRevenue = useMemo(() => {
        return pageOrders.reduce((total, order) => {
            return total + calculateFramesAndPrice(order, orderPricing).totalPrice
        }, 0)
    }, [orderPricing, pageOrders])

    const handleClearFilters = useCallback(() => {
        setSearchInput('')
        setSearchQuery('')
        setStatusFilter('all')
        setPaymentFilter('all')
        setAudioFilter('all')
        setPage(1)
    }, [])

    const handleProcessOrderAction = useCallback((orderId: string) => {
        void (async () => {
            try {
                await onProcessOrder(orderId)
            } finally {
                refreshOrders()
            }
        })()
    }, [onProcessOrder, refreshOrders])

    const handleDeleteOrderAction = useCallback((orderId: string) => {
        void (async () => {
            try {
                await onDeleteOrder(orderId)
            } finally {
                refreshOrders()
            }
        })()
    }, [onDeleteOrder, refreshOrders])

    return (
        <>
            <Card>
                <div className="mb-3">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Orders</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        Live order data from `/api/orders` and pricing from `/api/orders/pricing`.
                    </p>
                </div>

                {orderActionMessage ? <Alert color="info">{orderActionMessage}</Alert> : null}

                <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                    <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Total orders</p>
                        <p className="text-xl font-semibold text-gray-900 dark:text-white">{totalMatchingOrders}</p>
                    </div>
                    <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Estimated revenue (page)</p>
                        <p className="text-xl font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(totalEstimatedRevenue)}
                        </p>
                    </div>
                    <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Generated reels</p>
                        <p className="text-xl font-semibold text-gray-900 dark:text-white">{reels.length}</p>
                    </div>
                    <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Active reel jobs</p>
                        <p className="text-xl font-semibold text-gray-900 dark:text-white">{reelJobs.length}</p>
                    </div>
                    {ORDER_STATUS_ORDER.map((status) => (
                        <div key={status} className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                {formatStatusLabel(status)}
                            </p>
                            <p className="text-xl font-semibold text-gray-900 dark:text-white">{statusCounts[status]}</p>
                        </div>
                    ))}
                </div>
            </Card>

            <Card>
                {ordersError ? <Alert color="failure">{ordersError}</Alert> : null}

                <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                    <label className="space-y-1 rounded-md border border-gray-200 p-3 dark:border-gray-700 lg:col-span-2">
                        <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Search</span>
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(event) => {
                                setSearchInput(event.target.value)
                                setPage(1)
                            }}
                            placeholder="Order ID, name, email, script..."
                            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                        />
                    </label>

                    <label className="space-y-1 rounded-md border border-gray-200 p-3 dark:border-gray-700">
                        <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</span>
                        <select
                            value={statusFilter}
                            onChange={(event) => {
                                setStatusFilter(event.target.value as StatusFilter)
                                setPage(1)
                            }}
                            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                        >
                            <option value="all">All statuses</option>
                            {ORDER_STATUS_ORDER.map((status) => (
                                <option key={status} value={status}>
                                    {formatStatusLabel(status)}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="space-y-1 rounded-md border border-gray-200 p-3 dark:border-gray-700">
                        <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Payment</span>
                        <select
                            value={paymentFilter}
                            onChange={(event) => {
                                setPaymentFilter(event.target.value as PaymentFilter)
                                setPage(1)
                            }}
                            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                        >
                            <option value="all">All payment</option>
                            <option value="pending">Pending</option>
                            <option value="confirmed">Confirmed</option>
                        </select>
                    </label>

                    <label className="space-y-1 rounded-md border border-gray-200 p-3 dark:border-gray-700">
                        <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Audio</span>
                        <select
                            value={audioFilter}
                            onChange={(event) => {
                                setAudioFilter(event.target.value as AudioFilter)
                                setPage(1)
                            }}
                            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                        >
                            <option value="all">All audio</option>
                            <option value="tts_only">TTS only</option>
                            <option value="clip_only">Clip only</option>
                            <option value="clip_and_narrator">Clip + narrator</option>
                        </select>
                    </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Showing {pageOrders.length} of {totalMatchingOrders} orders.
                    </p>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Rows</span>
                        <select
                            value={String(pageSize)}
                            onChange={(event) => {
                                const nextPageSize = Number.parseInt(event.target.value, 10)
                                setPageSize(Number.isNaN(nextPageSize) ? DEFAULT_PAGE_SIZE : nextPageSize)
                                setPage(1)
                            }}
                            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                        >
                            {PAGE_SIZE_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>

                        <button
                            type="button"
                            onClick={handleClearFilters}
                            disabled={!hasActiveFilters}
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            Clear filters
                        </button>
                    </div>
                </div>

                {loadingOrders ? (
                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">Loading orders...</p>
                ) : totalMatchingOrders === 0 ? (
                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                        {hasActiveFilters ? 'No orders match your current filters.' : 'No orders found.'}
                    </p>
                ) : (
                    <>
                        <div className="mt-3 overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                <thead className="bg-gray-100 dark:bg-gray-900">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold">Order</th>
                                        <th className="px-3 py-2 text-left font-semibold">Customer</th>
                                        <th className="px-3 py-2 text-left font-semibold">Status</th>
                                        <th className="px-3 py-2 text-left font-semibold">Audio</th>
                                        <th className="px-3 py-2 text-left font-semibold">Frames</th>
                                        <th className="px-3 py-2 text-left font-semibold">Price</th>
                                        <th className="px-3 py-2 text-left font-semibold">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {pageOrders.map((order) => {
                                        const computed = calculateFramesAndPrice(order, orderPricing)
                                        const isProcessing = processingOrderIds[order.id] === true
                                        const showProcessVideo = canProcessVideo(order.orderStatus)
                                        const audioMode = resolveAudioMode(order)

                                        return (
                                            <tr key={order.id}>
                                                <td className="px-3 py-2 font-mono text-xs" title={order.id}>
                                                    {formatOrderIdForTable(order.id)}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <p className="font-medium text-gray-900 dark:text-white">{order.customerName}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">{order.customerEmail}</p>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Badge color="info">{formatStatusLabel(order.orderStatus)}</Badge>
                                                </td>
                                                <td className="px-3 py-2">{formatAudioMode(audioMode)}</td>
                                                <td className="px-3 py-2">{computed.frames}</td>
                                                <td className="px-3 py-2">{formatCurrency(computed.totalPrice)}</td>
                                                <td className="px-3 py-2">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {showProcessVideo ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleProcessOrderAction(order.id)}
                                                                disabled={isProcessing}
                                                                className="rounded-md border border-blue-600 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400 dark:border-blue-500 dark:text-blue-300 dark:hover:bg-blue-900/40 dark:disabled:border-gray-700 dark:disabled:text-gray-500"
                                                            >
                                                                {isProcessing ? 'Processing…' : 'Process video'}
                                                            </button>
                                                        ) : null}

                                                        <a
                                                            href={`${WEB_ORDERS_BASE_URL}/order?orderId=${encodeURIComponent(order.id)}&impersonate`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                                                        >
                                                            Impersonate
                                                        </a>

                                                        <a
                                                            href={`${WEB_ORDERS_BASE_URL}/receipt/${encodeURIComponent(order.id)}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                                                        >
                                                            Open receipt
                                                        </a>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteOrderAction(order.id)}
                                                            disabled={deletingOrderId === order.id}
                                                            title="Delete this order and its generated videos"
                                                            className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-900/30"
                                                        >
                                                            {deletingOrderId === order.id ? 'Deleting…' : 'Delete'}
                                                        </button>

                                                        <a
                                                            href={`/studio?orderId=${encodeURIComponent(order.id)}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="rounded-md border border-purple-600 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-50 dark:border-purple-500 dark:text-purple-300 dark:hover:bg-purple-900/40"
                                                        >
                                                            Studio
                                                        </a>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Page {page} of {totalPages}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                                    disabled={page <= 1 || loadingOrders}
                                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                                    disabled={page >= totalPages || loadingOrders}
                                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </Card>

            <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Reel jobs</h3>
                {reelJobs.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">No active reel jobs.</p>
                ) : (
                    <div className="mt-3 overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                            <thead className="bg-gray-100 dark:bg-gray-900">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">Job</th>
                                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                                    <th className="px-3 py-2 text-left font-semibold">Progress</th>
                                    <th className="px-3 py-2 text-left font-semibold">Stage</th>
                                    <th className="px-3 py-2 text-left font-semibold">Order</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {reelJobs.map((job) => (
                                    <tr key={job.id}>
                                        <td className="px-3 py-2 font-mono text-xs">{job.id}</td>
                                        <td className="px-3 py-2">
                                            <Badge color={job.status === 'failed' ? 'failure' : 'info'}>{job.status}</Badge>
                                        </td>
                                        <td className="px-3 py-2">{Math.round(job.progress)}%</td>
                                        <td className="px-3 py-2">{job.stage || '—'}</td>
                                        <td className="px-3 py-2">{job.orderId || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </>
    )
}
