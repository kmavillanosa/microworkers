import { useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Card } from 'flowbite-react'
import { Link, useParams } from 'react-router-dom'
import { apiBaseUrl } from '../api/client'
import { studioApi } from '../api/studioApi'
import type { Order, ReelItem } from '../api/types'

type ReelPreviews = Record<
    string,
    {
        srt: string
        script: string
    }
>

function toMediaUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path
    }

    return `${apiBaseUrl}${path}`
}

async function fetchTextPreview(path: string): Promise<string> {
    const response = await fetch(toMediaUrl(path))
    if (!response.ok) {
        throw new Error('Failed to load text preview')
    }

    return response.text()
}

function formatOrderStatus(status: Order['orderStatus']): string {
    if (status === 'ready_for_sending') {
        return 'Ready for sending'
    }

    return status.replace(/_/g, ' ')
}

function formatDateTime(value: string): string {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
        return 'Unknown date'
    }

    return parsed.toLocaleString()
}

export function OrderOutputPage() {
    const { orderId } = useParams<{ orderId: string }>()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [order, setOrder] = useState<Order | null>(null)
    const [orderReels, setOrderReels] = useState<ReelItem[]>([])
    const [reelPreviews, setReelPreviews] = useState<ReelPreviews>({})
    const [loadingPreviews, setLoadingPreviews] = useState(false)

    useEffect(() => {
        if (!orderId) {
            setLoading(false)
            setError('Missing order ID.')
            return
        }

        let cancelled = false
        setLoading(true)
        setError(null)
        setOrder(null)
        setOrderReels([])
        setReelPreviews({})

        void Promise.all([studioApi.getOrderById(orderId), studioApi.listOrderReels(orderId)])
            .then(([nextOrder, nextReels]) => {
                if (cancelled) {
                    return
                }

                setOrder(nextOrder)
                setOrderReels(nextReels)
            })
            .catch(() => {
                if (cancelled) {
                    return
                }

                setError('Failed to load order output details.')
            })
            .finally(() => {
                if (cancelled) {
                    return
                }

                setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [orderId])

    useEffect(() => {
        if (orderReels.length === 0) {
            setReelPreviews({})
            setLoadingPreviews(false)
            return
        }

        let cancelled = false
        setLoadingPreviews(true)

        void Promise.all(
            orderReels.map(async (reel) => {
                const [srtResult, scriptResult] = await Promise.allSettled([
                    fetchTextPreview(reel.srtUrl),
                    fetchTextPreview(reel.txtUrl),
                ])

                return {
                    reelId: reel.id,
                    srt:
                        srtResult.status === 'fulfilled'
                            ? srtResult.value
                            : 'Unable to load SRT preview.',
                    script:
                        scriptResult.status === 'fulfilled'
                            ? scriptResult.value
                            : 'Unable to load script preview.',
                }
            }),
        )
            .then((entries) => {
                if (cancelled) {
                    return
                }

                const nextPreviews: ReelPreviews = {}
                entries.forEach((entry) => {
                    nextPreviews[entry.reelId] = {
                        srt: entry.srt,
                        script: entry.script,
                    }
                })

                setReelPreviews(nextPreviews)
            })
            .finally(() => {
                if (cancelled) {
                    return
                }

                setLoadingPreviews(false)
            })

        return () => {
            cancelled = true
        }
    }, [orderReels])

    const sortedReels = useMemo(() => {
        return [...orderReels].sort(
            (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        )
    }, [orderReels])

    return (
        <>
            <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Order output</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            Preview output video, SRT, and script for this order.
                        </p>
                    </div>
                    <Link
                        to="/orders"
                        className="webstudio-inline-action rounded-md border border-gray-300 px-3 py-1.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                        Back to orders
                    </Link>
                </div>
            </Card>

            {error ? <Alert color="failure">{error}</Alert> : null}

            {loading ? (
                <Card>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Loading order output...</p>
                </Card>
            ) : null}

            {!loading && order ? (
                <>
                    <Card>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <p className="font-mono text-xs text-gray-500 dark:text-gray-400">Order {order.id}</p>
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white">{order.customerName}</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-300">{order.customerEmail}</p>
                            </div>
                            <Badge color="info">{formatOrderStatus(order.orderStatus)}</Badge>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Created</p>
                                <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{formatDateTime(order.createdAt)}</p>
                            </div>
                            <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Payment</p>
                                <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{order.paymentStatus}</p>
                            </div>
                            <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Voice</p>
                                <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{order.voiceName || '—'}</p>
                            </div>
                            <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Outputs</p>
                                <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{sortedReels.length}</p>
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Outputs</h3>
                            {loadingPreviews ? (
                                <p className="text-xs text-gray-500 dark:text-gray-400">Loading text previews...</p>
                            ) : null}
                        </div>

                        {sortedReels.length === 0 ? (
                            <p className="text-sm text-gray-600 dark:text-gray-300">No outputs generated for this order yet.</p>
                        ) : (
                            <div className="grid gap-4">
                                {sortedReels.map((reel, index) => {
                                    const preview = reelPreviews[reel.id]
                                    const videoUrl = toMediaUrl(reel.videoUrl)
                                    const srtUrl = toMediaUrl(reel.srtUrl)
                                    const scriptUrl = toMediaUrl(reel.txtUrl)

                                    return (
                                        <section
                                            key={reel.id}
                                            className="rounded-md border border-gray-200 p-3 dark:border-gray-700"
                                        >
                                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                                        Output {index + 1}
                                                    </p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                        {formatDateTime(reel.createdAt)}
                                                    </p>
                                                </div>
                                                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                                                    {reel.id.slice(-12)}
                                                </span>
                                            </div>

                                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
                                                <div>
                                                    <video
                                                        src={videoUrl}
                                                        controls
                                                        className="max-h-[28rem] w-full rounded-md border border-gray-300 bg-black object-contain dark:border-gray-700"
                                                    />

                                                    <div className="webstudio-inline-actions mt-2">
                                                        <a
                                                            href={videoUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="webstudio-inline-action rounded-md border border-gray-300 px-2 py-1 text-center text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                                                        >
                                                            Open output
                                                        </a>
                                                        <a
                                                            href={srtUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="webstudio-inline-action rounded-md border border-gray-300 px-2 py-1 text-center text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                                                        >
                                                            Open SRT
                                                        </a>
                                                        <a
                                                            href={scriptUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="webstudio-inline-action rounded-md border border-gray-300 px-2 py-1 text-center text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                                                        >
                                                            Open script
                                                        </a>
                                                    </div>
                                                </div>

                                                <div className="grid gap-3">
                                                    <div className="rounded-md border border-gray-200 p-2 dark:border-gray-700">
                                                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                            SRT preview
                                                        </p>
                                                        <pre className="max-h-60 overflow-auto whitespace-pre-wrap text-xs text-gray-800 dark:text-gray-200">
                                                            {preview?.srt || (loadingPreviews ? 'Loading SRT preview...' : 'No SRT preview.')}
                                                        </pre>
                                                    </div>

                                                    <div className="rounded-md border border-gray-200 p-2 dark:border-gray-700">
                                                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                            Script preview
                                                        </p>
                                                        <pre className="max-h-60 overflow-auto whitespace-pre-wrap text-xs text-gray-800 dark:text-gray-200">
                                                            {preview?.script || (loadingPreviews ? 'Loading script preview...' : 'No script preview.')}
                                                        </pre>
                                                    </div>
                                                </div>
                                            </div>
                                        </section>
                                    )
                                })}
                            </div>
                        )}
                    </Card>
                </>
            ) : null}
        </>
    )
}
