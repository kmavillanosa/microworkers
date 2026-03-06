import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Badge, Card, Dropdown, DropdownItem, Spinner } from 'flowbite-react'
import { Eye as EyeIcon, Terminal as TerminalIcon } from 'flowbite-react-icons/outline'
import { studioApi } from '../api/studioApi'
import type {
    Order,
    OrderAudioFilter,
    ReelJob,
    OrdersPageResponse,
    OrderStatus,
    StudioBootstrap,
} from '../api/types'

type OrdersPageProps = {
    orderPricing: StudioBootstrap['orderPricing']
    reels: StudioBootstrap['reels']
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
const JOB_POLL_INTERVAL_MS = 3000

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

function canProcessVideo(orderStatus: OrderStatus, hasProcessedOutput: boolean): boolean {
    if (orderStatus === 'processing' || orderStatus === 'ready_for_sending') {
        return false
    }

    if (orderStatus === 'closed') {
        return !hasProcessedOutput
    }

    return true
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

type OrderProgressTone = 'normal' | 'success' | 'failure'

function resolveOrderProgress(
    order: Order,
    isProcessing: boolean,
    hasProcessedOutput: boolean,
    activeJob?: ReelJob,
): { percent: number; label: string; tone: OrderProgressTone } {
    if (activeJob && (activeJob.status === 'queued' || activeJob.status === 'processing')) {
        const rawProgress =
            typeof activeJob.progress === 'number' && Number.isFinite(activeJob.progress)
                ? activeJob.progress
                : 0
        const percent = Math.max(1, Math.min(99, Math.floor(rawProgress)))

        if (activeJob.status === 'queued') {
            return { percent, label: 'Queued', tone: 'normal' }
        }

        return { percent, label: `${percent}%`, tone: 'normal' }
    }

    if (order.orderStatus === 'ready_for_sending') {
        return { percent: 100, label: '100%', tone: 'success' }
    }

    if (order.orderStatus === 'closed') {
        if (hasProcessedOutput) {
            return { percent: 100, label: '100%', tone: 'success' }
        }

        return { percent: 0, label: '0%', tone: 'normal' }
    }

    if (order.orderStatus === 'declined') {
        return { percent: 0, label: 'Declined', tone: 'failure' }
    }

    if (isProcessing || order.orderStatus === 'processing') {
        return { percent: 10, label: 'Processing', tone: 'normal' }
    }

    if (order.orderStatus === 'accepted') {
        return { percent: 5, label: 'Accepted', tone: 'normal' }
    }

    return { percent: 0, label: '0%', tone: 'normal' }
}

export function OrdersPage({
    orderPricing,
    reels,
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
    const [activeJobsByOrderId, setActiveJobsByOrderId] = useState<Record<string, ReelJob>>({})
    const [statusActionMessage, setStatusActionMessage] = useState<string | null>(null)
    const [statusUpdatingOrderIds, setStatusUpdatingOrderIds] = useState<Record<string, boolean>>({})
    const [reloadToken, setReloadToken] = useState(0)
    const hadActiveOrderJobsRef = useRef(false)

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

        const loadActiveJobs = async () => {
            try {
                const jobs = await studioApi.listReelJobs()
                if (cancelled) {
                    return
                }

                const next: Record<string, ReelJob> = {}
                let hasActiveOrderJobs = false

                jobs.forEach((job) => {
                    if (!job.orderId) {
                        return
                    }

                    if (job.status !== 'queued' && job.status !== 'processing') {
                        return
                    }

                    hasActiveOrderJobs = true
                    const existing = next[job.orderId]
                    if (!existing || (job.progress ?? 0) >= (existing.progress ?? 0)) {
                        next[job.orderId] = job
                    }
                })

                setActiveJobsByOrderId(next)

                if (hasActiveOrderJobs || hadActiveOrderJobsRef.current) {
                    refreshOrders()
                }

                hadActiveOrderJobsRef.current = hasActiveOrderJobs
            } catch {
                if (!cancelled) {
                    setActiveJobsByOrderId({})
                }
            }
        }

        void loadActiveJobs()
        const timer = window.setInterval(() => {
            void loadActiveJobs()
        }, JOB_POLL_INTERVAL_MS)

        return () => {
            cancelled = true
            window.clearInterval(timer)
        }
    }, [refreshOrders])

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
    const isInitialOrdersLoad = loadingOrders && pageOrders.length === 0
    const isRefreshingOrders = loadingOrders && pageOrders.length > 0

    const hasActiveFilters =
        searchInput.trim().length > 0 || statusFilter !== 'all' || paymentFilter !== 'all' || audioFilter !== 'all'

    const processedOrderIds = useMemo(() => {
        const ids = new Set<string>()

        reels.forEach((reel) => {
            if (reel.orderId) {
                ids.add(reel.orderId)
            }
        })

        return ids
    }, [reels])

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

    const handleOrderStatusChange = useCallback((orderId: string, nextStatus: OrderStatus) => {
        const currentStatus = pageOrders.find((entry) => entry.id === orderId)?.orderStatus
        if (!nextStatus || currentStatus === nextStatus) {
            return
        }

        void (async () => {
            setStatusActionMessage(null)
            setOrdersError(null)
            setStatusUpdatingOrderIds((current) => ({
                ...current,
                [orderId]: true,
            }))

            try {
                await studioApi.updateOrderStatus(orderId, nextStatus)
                setOrdersPage((current) => ({
                    ...current,
                    items: current.items.map((entry) =>
                        entry.id === orderId
                            ? {
                                ...entry,
                                orderStatus: nextStatus,
                            }
                            : entry,
                    ),
                }))
                setStatusActionMessage(
                    `Order ${formatOrderIdForTable(orderId)} status updated to ${formatStatusLabel(nextStatus)}.`,
                )
                refreshOrders()
            } catch {
                setOrdersError('Failed to update order status.')
            } finally {
                setStatusUpdatingOrderIds((current) => {
                    const next = { ...current }
                    delete next[orderId]
                    return next
                })
            }
        })()
    }, [pageOrders, refreshOrders])

    return (
        <div>
            <Card>
                <div className="mb-3">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Orders</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        Live order list with quick filters and actions.
                    </p>
                </div>

                {orderActionMessage ? (
                    <div className="mb-3">
                        <Alert color="info">{orderActionMessage}</Alert>
                    </div>
                ) : null}

                {statusActionMessage ? (
                    <div className="mb-3">
                        <Alert color="success">{statusActionMessage}</Alert>
                    </div>
                ) : null}

                {ordersError ? (
                    <div className="mb-3">
                        <Alert color="failure">{ordersError}</Alert>
                    </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                    <label className="space-y-1 rounded-md border border-gray-200 p-3 dark:border-gray-700 lg:col-span-2">
                        <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Search</span>
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(event) => {
                                setSearchInput(event.target.value)
                                setPage(1)
                            }}
                            placeholder="Order ID, name, email, script, payment ref/descriptor..."
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

                {isInitialOrdersLoad ? (
                    <div className="mt-3 inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <Spinner size="sm" />
                        <span>Loading orders...</span>
                    </div>
                ) : totalMatchingOrders === 0 ? (
                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                        {hasActiveFilters ? 'No orders match your current filters.' : 'No orders found.'}
                    </p>
                ) : (
                    <>
                        <div className="mt-3 flex items-center justify-end">
                            {isRefreshingOrders ? (
                                <div className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                                    <Spinner size="sm" />
                                    <span>Refreshing…</span>
                                </div>
                            ) : null}
                        </div>

                        <div className={`mt-2 overflow-x-auto${isRefreshingOrders ? ' relative' : ''}`}>
                            {isRefreshingOrders ? (
                                <div className="pointer-events-none absolute inset-0 z-10 bg-white/40 dark:bg-gray-900/40" />
                            ) : null}

                            <table
                                className={`min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700${isRefreshingOrders ? ' opacity-70' : ''}`}
                            >
                                <thead className="bg-gray-100 dark:bg-gray-900">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold">Order</th>
                                        <th className="px-3 py-2 text-left font-semibold">Customer</th>
                                        <th className="px-3 py-2 text-left font-semibold">Payment</th>
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
                                        const activeJob = activeJobsByOrderId[order.id]
                                        const hasActiveJob = Boolean(
                                            activeJob &&
                                            (activeJob.status === 'queued' || activeJob.status === 'processing'),
                                        )
                                        const isProcessing = processingOrderIds[order.id] === true || hasActiveJob
                                        const isUpdatingOrderStatus = statusUpdatingOrderIds[order.id] === true
                                        const hasProcessedBefore = processedOrderIds.has(order.id)
                                        const showProcessVideo = !hasActiveJob && canProcessVideo(order.orderStatus, hasProcessedBefore)
                                        const audioMode = resolveAudioMode(order)
                                        const shouldShowProgress =
                                            !hasProcessedBefore &&
                                            (hasActiveJob ||
                                                isProcessing ||
                                                order.orderStatus === 'processing' ||
                                                order.orderStatus === 'accepted' ||
                                                order.orderStatus === 'ready_for_sending' ||
                                                order.orderStatus === 'closed' ||
                                                order.orderStatus === 'declined')
                                        const orderProgress = shouldShowProgress
                                            ? resolveOrderProgress(order, isProcessing, hasProcessedBefore, activeJob)
                                            : null
                                        const progressBarFillClass =
                                            orderProgress?.tone === 'failure'
                                                ? 'bg-red-500 dark:bg-red-400'
                                                : orderProgress?.tone === 'success'
                                                    ? 'bg-green-600 dark:bg-green-500'
                                                    : 'bg-blue-600 dark:bg-blue-500'

                                        return (
                                            <tr key={order.id}>
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-xs" title={order.id}>
                                                            {formatOrderIdForTable(order.id)}
                                                        </span>
                                                        {orderProgress ? (
                                                            <>
                                                                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                                                    <div
                                                                        className={`h-full rounded-full transition-all ${progressBarFillClass}`}
                                                                        style={{ width: `${orderProgress.percent}%` }}
                                                                    />
                                                                </div>
                                                                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                                                    {orderProgress.label}
                                                                </span>
                                                            </>
                                                        ) : null}

                                                        {showProcessVideo ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleProcessOrderAction(order.id)}
                                                                disabled={isProcessing}
                                                                aria-label={isProcessing ? 'Processing' : 'Process'}
                                                                title={isProcessing ? 'Processing…' : 'Process'}
                                                                className="inline-flex items-center justify-center rounded-md border border-blue-600 p-1 text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400 dark:border-blue-500 dark:text-blue-300 dark:hover:bg-blue-900/40 dark:disabled:border-gray-700 dark:disabled:text-gray-500"
                                                            >
                                                                <TerminalIcon className={`h-3.5 w-3.5${isProcessing ? ' animate-pulse' : ''}`} />
                                                            </button>
                                                        ) : null}

                                                        {hasProcessedBefore ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    window.location.assign(
                                                                        `/orders/${encodeURIComponent(order.id)}/output`,
                                                                    )
                                                                }}
                                                                aria-label="View output"
                                                                title="View output"
                                                                className="inline-flex items-center justify-center rounded-md border border-green-600 p-1 text-green-700 hover:bg-green-50 dark:border-green-500 dark:text-green-300 dark:hover:bg-green-900/40"
                                                            >
                                                                <EyeIcon className="h-3.5 w-3.5" />
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <p className="font-medium text-gray-900 dark:text-white">{order.customerName}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">{order.customerEmail}</p>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="space-y-1">
                                                        <Badge color={order.paymentStatus === 'confirmed' ? 'success' : 'warning'}>
                                                            {order.paymentStatus === 'confirmed' ? 'Confirmed' : 'Pending'}
                                                        </Badge>
                                                        {order.bankCode ? (
                                                            <p className="text-xs text-gray-600 dark:text-gray-300">Bank: {order.bankCode}</p>
                                                        ) : null}
                                                        {order.paymentReference ? (
                                                            <p className="max-w-xs truncate text-xs text-gray-600 dark:text-gray-300" title={order.paymentReference}>
                                                                Ref: {order.paymentReference}
                                                            </p>
                                                        ) : null}
                                                        {order.paymentDescriptor ? (
                                                            <p className="max-w-xs truncate text-xs text-gray-600 dark:text-gray-300" title={order.paymentDescriptor}>
                                                                Desc: {order.paymentDescriptor}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="space-y-1">
                                                        <label className="sr-only" htmlFor={`order-status-${order.id}`}>
                                                            Order status
                                                        </label>
                                                        <select
                                                            id={`order-status-${order.id}`}
                                                            value={order.orderStatus}
                                                            onChange={(event) =>
                                                                handleOrderStatusChange(order.id, event.target.value as OrderStatus)
                                                            }
                                                            disabled={isUpdatingOrderStatus || loadingOrders}
                                                            className="w-full min-w-[160px] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                                        >
                                                            {ORDER_STATUS_ORDER.map((status) => (
                                                                <option key={status} value={status}>
                                                                    {formatStatusLabel(status)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {isUpdatingOrderStatus ? (
                                                            <p className="text-xs text-gray-500 dark:text-gray-400">Saving status...</p>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">{formatAudioMode(audioMode)}</td>
                                                <td className="px-3 py-2">{computed.frames}</td>
                                                <td className="px-3 py-2">{formatCurrency(computed.totalPrice)}</td>
                                                <td className="px-3 py-2">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <a
                                                            href={`/studio?orderId=${encodeURIComponent(order.id)}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="rounded-md border border-purple-600 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-50 dark:border-purple-500 dark:text-purple-300 dark:hover:bg-purple-900/40"
                                                        >
                                                            Studio
                                                        </a>

                                                        <div className="ml-auto">
                                                            <Dropdown label="Manage" size="xs" placement="bottom-end" dismissOnClick>
                                                                <DropdownItem
                                                                    onClick={() => {
                                                                        window.open(
                                                                            `${WEB_ORDERS_BASE_URL}/order?orderId=${encodeURIComponent(order.id)}&impersonate`,
                                                                            '_blank',
                                                                            'noopener,noreferrer',
                                                                        )
                                                                    }}
                                                                >
                                                                    Impersonate
                                                                </DropdownItem>
                                                                <DropdownItem
                                                                    onClick={() => {
                                                                        window.open(
                                                                            `${WEB_ORDERS_BASE_URL}/receipt/${encodeURIComponent(order.id)}`,
                                                                            '_blank',
                                                                            'noopener,noreferrer',
                                                                        )
                                                                    }}
                                                                >
                                                                    Open receipt
                                                                </DropdownItem>
                                                                <DropdownItem
                                                                    onClick={() => {
                                                                        if (deletingOrderId === order.id) {
                                                                            return
                                                                        }
                                                                        handleDeleteOrderAction(order.id)
                                                                    }}
                                                                    disabled={deletingOrderId === order.id}
                                                                    className="text-red-600 hover:bg-red-50! dark:text-red-400 dark:hover:bg-red-900/30!"
                                                                >
                                                                    {deletingOrderId === order.id ? 'Deleting…' : 'Delete order'}
                                                                </DropdownItem>
                                                            </Dropdown>
                                                        </div>
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
        </div>
    )
}
