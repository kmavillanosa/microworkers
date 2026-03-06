import { useMemo } from 'react'
import { Alert, Badge, Card } from 'flowbite-react'
import type { Order, OrderStatus, StudioBootstrap } from '../api/types'

type OrdersPageProps = {
    orders: Order[]
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

const ORDER_STATUS_ORDER: OrderStatus[] = [
    'pending',
    'accepted',
    'processing',
    'ready_for_sending',
    'closed',
    'declined',
]

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

export function OrdersPage({
    orders,
    orderPricing,
    reels,
    reelJobs,
    processingOrderIds,
    deletingOrderId,
    orderActionMessage,
    onProcessOrder,
    onDeleteOrder,
}: OrdersPageProps) {
    const sortedOrders = useMemo(() => {
        return [...orders].sort(
            (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        )
    }, [orders])

    const statusCounts = useMemo(() => {
        const counts: Record<OrderStatus, number> = {
            pending: 0,
            accepted: 0,
            declined: 0,
            processing: 0,
            ready_for_sending: 0,
            closed: 0,
        }

        sortedOrders.forEach((order) => {
            counts[order.orderStatus] += 1
        })

        return counts
    }, [sortedOrders])

    const totalEstimatedRevenue = useMemo(() => {
        return sortedOrders.reduce((total, order) => {
            return total + calculateFramesAndPrice(order, orderPricing).totalPrice
        }, 0)
    }, [orderPricing, sortedOrders])

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
                        <p className="text-xl font-semibold text-gray-900 dark:text-white">{sortedOrders.length}</p>
                    </div>
                    <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Estimated revenue</p>
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
                {sortedOrders.length === 0 ? (
                    <p className="text-sm text-gray-600 dark:text-gray-300">No orders found.</p>
                ) : (
                    <div className="overflow-x-auto">
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
                                {sortedOrders.map((order) => {
                                    const computed = calculateFramesAndPrice(order, orderPricing)
                                    const isProcessing = processingOrderIds[order.id] === true
                                    const showProcessVideo = canProcessVideo(order.orderStatus)
                                    return (
                                        <tr key={order.id}>
                                            <td className="px-3 py-2 font-mono text-xs">{order.id}</td>
                                            <td className="px-3 py-2">
                                                <p className="font-medium text-gray-900 dark:text-white">{order.customerName}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{order.customerEmail}</p>
                                            </td>
                                            <td className="px-3 py-2">
                                                <Badge color="info">{formatStatusLabel(order.orderStatus)}</Badge>
                                            </td>
                                            <td className="px-3 py-2">
                                                {order.useClipAudioWithNarrator
                                                    ? 'Clip + narrator'
                                                    : order.useClipAudio
                                                        ? 'Clip only'
                                                        : 'TTS only'}
                                            </td>
                                            <td className="px-3 py-2">{computed.frames}</td>
                                            <td className="px-3 py-2">{formatCurrency(computed.totalPrice)}</td>
                                            <td className="px-3 py-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {showProcessVideo ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                void onProcessOrder(order.id)
                                                            }}
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
                                                        onClick={() => {
                                                            void onDeleteOrder(order.id)
                                                        }}
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
