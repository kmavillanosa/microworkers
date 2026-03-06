import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isStudioOutputSize, type Order, type ReelItem, type StudioOutputSize } from '../api/types'
import { studioApi } from '../api/studioApi'
import { StudioEditor } from '../components/StudioEditor'

type StudioPageProps = {
    orders: Order[]
    reels: ReelItem[]
    wordsPerFrame?: number | null
}

function resolveOutputSize(order: Order | null): StudioOutputSize {
    if (!order) {
        return 'phone'
    }

    return isStudioOutputSize(order.outputSize) ? order.outputSize : 'phone'
}

export function StudioPage({ orders, reels, wordsPerFrame }: StudioPageProps) {
    const [searchParams] = useSearchParams()
    const orderId = searchParams.get('orderId')?.trim() ?? ''
    const videoUrlFromQuery = searchParams.get('videoUrl')?.trim() ?? ''

    const [apiOrder, setApiOrder] = useState<Order | null>(null)
    const [apiOrderReels, setApiOrderReels] = useState<ReelItem[]>([])

    useEffect(() => {
        let cancelled = false

        if (!orderId) {
            setApiOrder(null)
            setApiOrderReels([])
            return () => {
                cancelled = true
            }
        }

        void Promise.all([
            studioApi.getOrderById(orderId).catch(() => null),
            studioApi.listOrderReels(orderId).catch(() => []),
        ]).then(([nextOrder, nextReels]) => {
            if (cancelled) {
                return
            }

            setApiOrder(nextOrder)
            setApiOrderReels(nextReels)
        })

        return () => {
            cancelled = true
        }
    }, [orderId])

    const bootstrapOrder = useMemo(() => {
        if (!orderId) {
            return null
        }

        return orders.find((item) => item.id === orderId) ?? null
    }, [orderId, orders])

    const order = apiOrder ?? bootstrapOrder

    const outputSize = resolveOutputSize(order)
    const script = order?.script ?? ''
    const contextId = orderId ? `order:${orderId}` : 'studio'

    const latestOrderVideoUrl = useMemo(() => {
        if (!orderId) {
            return ''
        }

        const sourceReels = apiOrderReels.length > 0
            ? apiOrderReels
            : reels

        const matchingReels = sourceReels
            .filter((reel) => reel.orderId === orderId && typeof reel.videoUrl === 'string' && reel.videoUrl.trim())
            .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

        return matchingReels[0]?.videoUrl?.trim() ?? ''
    }, [apiOrderReels, orderId, reels])

    const videoUrl = videoUrlFromQuery || latestOrderVideoUrl
    const normalizedWordsPerFrame =
        typeof wordsPerFrame === 'number' && Number.isFinite(wordsPerFrame)
            ? Math.max(1, Math.floor(wordsPerFrame))
            : 4

    return (
        <div className="h-dvh w-screen overflow-hidden">
            {order && <StudioEditor
                outputSize={outputSize}
                contextId={contextId}
                script={script}
                videoUrl={videoUrl}
                wordsPerFrame={normalizedWordsPerFrame}
            />}
        </div>
    )
}
