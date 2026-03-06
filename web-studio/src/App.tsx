import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert } from 'flowbite-react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { loadStudioBootstrap, studioApi } from './api/studioApi'
import type { StudioBootstrap } from './api/types'
import { OrderOutputPage } from './pages/OrderOutputPage'
import { OrdersPage } from './pages/OrdersPage'
import { StudioPage } from './pages/StudioPage'
import {
    SettingsAccountsPage,
    SettingsClipsPage,
    SettingsDangerPage,
    SettingsFontsPage,
    SettingsLayout,
    SettingsNichesPage,
    SettingsPaymentPage,
    SettingsPipelinesPage,
    SettingsPricingPage,
    type SettingsPricingEditState,
    type SettingsPricingField,
    SettingsVoicesPage,
} from './pages/SettingsPage'
import './App.css'

type ClipType = 'game' | 'order'

function topTabClass(isActive: boolean): string {
    if (isActive) {
        return 'inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white'
    }

    return 'inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
}

const EMPTY_PRICING_EDIT: SettingsPricingEditState = {
    wordsPerFrame: '',
    pricePerFramePesos: '',
    clipOnly: '',
    clipAndNarrator: '',
}

function toEditableNumber(value: number | null | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return ''
    }

    return String(value)
}

function resolveOrderPricingEdit(orderPricing: StudioBootstrap['orderPricing']): SettingsPricingEditState {
    const tiered = orderPricing?.pricePerFramePesosByTier
    const ttsOnly = tiered?.ttsOnly ?? orderPricing?.pricePerFramePesos
    const clipOnly = tiered?.clipOnly ?? orderPricing?.clipOnly ?? ttsOnly
    const clipAndNarrator = tiered?.clipAndNarrator ?? orderPricing?.clipAndNarrator ?? ttsOnly

    return {
        wordsPerFrame: toEditableNumber(orderPricing?.wordsPerFrame),
        pricePerFramePesos: toEditableNumber(ttsOnly),
        clipOnly: toEditableNumber(clipOnly),
        clipAndNarrator: toEditableNumber(clipAndNarrator),
    }
}

function App() {
    const location = useLocation()
    const isStudioRoute = location.pathname.startsWith('/studio')
    const [studioData, setStudioData] = useState<StudioBootstrap | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [dangerBusy, setDangerBusy] = useState(false)
    const [dangerMessage, setDangerMessage] = useState<string | null>(null)
    const [paymentMethodsSaving, setPaymentMethodsSaving] = useState(false)
    const [paymentMethodsMessage, setPaymentMethodsMessage] = useState<string | null>(null)
    const [maintainanceModeSaving, setMaintainanceModeSaving] = useState(false)
    const [maintainanceModeMessage, setMaintainanceModeMessage] = useState<string | null>(null)
    const [fontUploading, setFontUploading] = useState(false)
    const [fontSavingId, setFontSavingId] = useState<string | null>(null)
    const [fontDeletingId, setFontDeletingId] = useState<string | null>(null)
    const [fontMessage, setFontMessage] = useState<string | null>(null)
    const [clipsBusyType, setClipsBusyType] = useState<ClipType | null>(null)
    const [deletingClipId, setDeletingClipId] = useState<string | null>(null)
    const [clipsMessage, setClipsMessage] = useState<string | null>(null)
    const [voiceTogglingId, setVoiceTogglingId] = useState<string | null>(null)
    const [voicePreviewingId, setVoicePreviewingId] = useState<string | null>(null)
    const [voiceInstallingId, setVoiceInstallingId] = useState<string | null>(null)
    const [voiceActionMessage, setVoiceActionMessage] = useState<string | null>(null)
    const [processingOrderIds, setProcessingOrderIds] = useState<Record<string, boolean>>({})
    const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null)
    const [orderActionMessage, setOrderActionMessage] = useState<string | null>(null)
    const [orderPricingEdit, setOrderPricingEdit] = useState<SettingsPricingEditState>(EMPTY_PRICING_EDIT)
    const [orderPricingSaving, setOrderPricingSaving] = useState(false)
    const [orderPricingMessage, setOrderPricingMessage] = useState<string | null>(null)
    const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null)
    const voicePreviewUrlRef = useRef<string | null>(null)
    const isMaintainanceModeOn = studioData?.isOnMaintainanceMode === true

    const stopVoicePreview = useCallback(() => {
        if (voicePreviewAudioRef.current) {
            voicePreviewAudioRef.current.pause()
            voicePreviewAudioRef.current.src = ''
            voicePreviewAudioRef.current = null
        }

        if (voicePreviewUrlRef.current) {
            URL.revokeObjectURL(voicePreviewUrlRef.current)
            voicePreviewUrlRef.current = null
        }
    }, [])

    const refreshStudioData = useCallback(async () => {
        setError(null)

        try {
            const nextData = await loadStudioBootstrap()
            setStudioData(nextData)
            setOrderPricingEdit(resolveOrderPricingEdit(nextData.orderPricing))
        } catch {
            setError('Failed to load API data from reelagad.com.')
        }
    }, [])

    useEffect(() => {
        void refreshStudioData()
    }, [refreshStudioData])

    useEffect(() => {
        return () => {
            stopVoicePreview()
        }
    }, [stopVoicePreview])

    const handleDeleteAllOrders = useCallback(async () => {
        const confirmed = window.confirm(
            'Permanently delete ALL orders, all order-generated videos, and all customer-uploaded order clips?',
        )

        if (!confirmed) {
            return
        }

        setDangerBusy(true)
        setDangerMessage(null)

        try {
            const result = await studioApi.deleteAllOrdersAndRelated()
            setDangerMessage(
                `Deleted ${result.ordersDeleted} orders, ${result.orderReelsDeleted} reels, and ${result.orderClipsDeleted} order clips.`,
            )
            await refreshStudioData()
        } catch {
            setDangerMessage('Failed to delete order-related data.')
        } finally {
            setDangerBusy(false)
        }
    }, [refreshStudioData])

    const handleTogglePaymentMethodEnabled = useCallback(async (paymentMethodId: string, enabled: boolean) => {
        const currentEnabled = studioData?.paymentMethods?.enabled ?? []
        const nextEnabled = enabled
            ? Array.from(new Set([...currentEnabled, paymentMethodId]))
            : currentEnabled.filter((id) => id !== paymentMethodId)

        if (nextEnabled.length === 0) {
            setPaymentMethodsMessage('At least one payment method must remain enabled.')
            return
        }

        setPaymentMethodsSaving(true)
        setPaymentMethodsMessage(null)

        setStudioData((current) => {
            if (!current?.paymentMethods) {
                return current
            }

            return {
                ...current,
                paymentMethods: {
                    ...current.paymentMethods,
                    enabled: nextEnabled,
                },
            }
        })

        try {
            const updated = await studioApi.updatePaymentMethodsEnabled(nextEnabled)
            setStudioData((current) => {
                if (!current?.paymentMethods) {
                    return current
                }

                return {
                    ...current,
                    paymentMethods: {
                        ...current.paymentMethods,
                        enabled: updated.enabled,
                    },
                }
            })
            setPaymentMethodsMessage('Saved.')
        } catch {
            setStudioData((current) => {
                if (!current?.paymentMethods) {
                    return current
                }

                return {
                    ...current,
                    paymentMethods: {
                        ...current.paymentMethods,
                        enabled: currentEnabled,
                    },
                }
            })
            setPaymentMethodsMessage('Failed to update payment methods.')
        } finally {
            setPaymentMethodsSaving(false)
        }
    }, [studioData])

    const handleToggleMaintainanceMode = useCallback(async (isOnMaintainanceMode: boolean) => {
        const currentMode = studioData?.isOnMaintainanceMode === true

        setMaintainanceModeSaving(true)
        setMaintainanceModeMessage(null)

        setStudioData((current) => {
            if (!current) {
                return current
            }

            return {
                ...current,
                isOnMaintainanceMode,
            }
        })

        try {
            const updated = await studioApi.updateMaintainanceMode(isOnMaintainanceMode)
            setStudioData((current) => {
                if (!current) {
                    return current
                }

                return {
                    ...current,
                    isOnMaintainanceMode: updated.isOnMaintainanceMode === true,
                }
            })
            setMaintainanceModeMessage('Saved.')
        } catch {
            setStudioData((current) => {
                if (!current) {
                    return current
                }

                return {
                    ...current,
                    isOnMaintainanceMode: currentMode,
                }
            })
            setMaintainanceModeMessage('Failed to update maintainance mode.')
        } finally {
            setMaintainanceModeSaving(false)
        }
    }, [studioData])

    const handleRefreshFonts = useCallback(async () => {
        const refreshedFonts = await studioApi.listFonts().catch(() => null)
        if (!refreshedFonts) {
            return
        }

        setStudioData((current) => {
            if (!current) {
                return current
            }

            return {
                ...current,
                fonts: refreshedFonts,
            }
        })
    }, [])

    const handleUploadFont = useCallback(async (file: File) => {
        setFontUploading(true)
        setFontMessage(null)

        try {
            await studioApi.uploadFont(file)
            await handleRefreshFonts()
            setFontMessage(`Uploaded ${file.name}.`)
        } catch {
            setFontMessage('Failed to upload font.')
        } finally {
            setFontUploading(false)
        }
    }, [handleRefreshFonts])

    const handleUpdateFontName = useCallback(async (fontId: string, name: string) => {
        setFontSavingId(fontId)
        setFontMessage(null)

        try {
            await studioApi.updateFont(fontId, name)
            await handleRefreshFonts()
            setFontMessage('Font name updated.')
        } catch {
            setFontMessage('Failed to update font name.')
        } finally {
            setFontSavingId(null)
        }
    }, [handleRefreshFonts])

    const handleDeleteFont = useCallback(async (fontId: string) => {
        const confirmed = window.confirm('Remove this font?')
        if (!confirmed) {
            return
        }

        setFontDeletingId(fontId)
        setFontMessage(null)

        try {
            await studioApi.deleteFont(fontId)
            await handleRefreshFonts()
            setFontMessage('Font removed.')
        } catch {
            setFontMessage('Failed to remove font.')
        } finally {
            setFontDeletingId(null)
        }
    }, [handleRefreshFonts])

    const handleUploadClip = useCallback(async (clipType: ClipType, file: File) => {
        setClipsBusyType(clipType)
        setClipsMessage(null)

        try {
            const uploadedClip = clipType === 'game'
                ? await studioApi.uploadClip(file)
                : await studioApi.uploadOrderClip(file)

            setStudioData((current) => {
                if (!current) {
                    return current
                }

                if (clipType === 'game') {
                    return {
                        ...current,
                        clips: [uploadedClip, ...current.clips.filter((clip) => clip.name !== uploadedClip.name)],
                    }
                }

                return {
                    ...current,
                    orderClips: [uploadedClip, ...current.orderClips.filter((clip) => clip.name !== uploadedClip.name)],
                }
            })

            setClipsMessage(`Uploaded ${uploadedClip.displayName || uploadedClip.name}.`)
        } catch {
            setClipsMessage(`Failed to upload ${clipType === 'game' ? 'game' : 'order'} clip.`)
        } finally {
            setClipsBusyType(null)
        }
    }, [])

    const handleUploadGameClip = useCallback(async (file: File) => {
        await handleUploadClip('game', file)
    }, [handleUploadClip])

    const handleUploadOrderClip = useCallback(async (file: File) => {
        await handleUploadClip('order', file)
    }, [handleUploadClip])

    const handleDeleteClip = useCallback(async (clipType: ClipType, clipId: string) => {
        const confirmed = window.confirm(`Remove this ${clipType} clip?`)
        if (!confirmed) {
            return
        }

        setDeletingClipId(clipId)
        setClipsMessage(null)

        try {
            if (clipType === 'game') {
                await studioApi.deleteClip(clipId)
            } else {
                await studioApi.deleteOrderClip(clipId)
            }

            setStudioData((current) => {
                if (!current) {
                    return current
                }

                if (clipType === 'game') {
                    return {
                        ...current,
                        clips: current.clips.filter((clip) => clip.name !== clipId),
                    }
                }

                return {
                    ...current,
                    orderClips: current.orderClips.filter((clip) => clip.name !== clipId),
                }
            })

            setClipsMessage('Clip removed.')
        } catch {
            setClipsMessage('Failed to remove clip.')
        } finally {
            setDeletingClipId(null)
        }
    }, [])

    const handleToggleVoiceEnabled = useCallback(async (voiceId: string, enabled: boolean) => {
        setVoiceTogglingId(voiceId)
        setVoiceActionMessage(null)

        try {
            await studioApi.updateSettingsVoiceEnabled(voiceId, enabled)
            const refreshedVoices = await studioApi.listVoices().catch(() => null)

            setStudioData((current) => {
                if (!current) {
                    return current
                }

                return {
                    ...current,
                    settingsVoices: current.settingsVoices.map((voice) =>
                        voice.id === voiceId ? { ...voice, enabled } : voice,
                    ),
                    voices: refreshedVoices ?? current.voices,
                }
            })
        } catch {
            setError('Failed to update voice status.')
            setVoiceActionMessage('Failed to update voice status.')
        } finally {
            setVoiceTogglingId(null)
        }
    }, [])

    const handlePreviewVoice = useCallback(async (voiceId: string, text?: string) => {
        setVoiceActionMessage(null)
        stopVoicePreview()
        setVoicePreviewingId(voiceId)

        try {
            const blob = await studioApi.previewVoice(voiceId, text)
            const objectUrl = URL.createObjectURL(blob)
            const audio = new Audio(objectUrl)

            voicePreviewAudioRef.current = audio
            voicePreviewUrlRef.current = objectUrl

            audio.onended = () => {
                stopVoicePreview()
                setVoicePreviewingId((current) => (current === voiceId ? null : current))
            }

            audio.onerror = () => {
                stopVoicePreview()
                setVoicePreviewingId((current) => (current === voiceId ? null : current))
                setVoiceActionMessage('Failed to play voice preview.')
            }

            await audio.play()
        } catch {
            stopVoicePreview()
            setVoicePreviewingId(null)
            setVoiceActionMessage('Voice preview is not available for this voice.')
        }
    }, [stopVoicePreview])

    const handleInstallPiperVoice = useCallback(async (voiceId: string) => {
        setVoiceInstallingId(voiceId)
        setVoiceActionMessage(null)

        try {
            const installed = await studioApi.installPiperVoice(voiceId)
            setVoiceActionMessage(`Installed Piper voice: ${installed.name}.`)

            const refreshedVoices = await studioApi.listVoices().catch(() => null)
            if (refreshedVoices) {
                setStudioData((current) => {
                    if (!current) {
                        return current
                    }

                    return {
                        ...current,
                        voices: refreshedVoices,
                    }
                })
            }
        } catch {
            setVoiceActionMessage('Failed to install Piper voice.')
        } finally {
            setVoiceInstallingId(null)
        }
    }, [])

    const handleOrderPricingEditChange = useCallback((field: SettingsPricingField, value: string) => {
        setOrderPricingEdit((current) => ({
            ...current,
            [field]: value,
        }))
    }, [])

    const handleSaveOrderPricing = useCallback(async () => {
        const wordsPerFrame = Number.parseInt(orderPricingEdit.wordsPerFrame, 10)
        const pricePerFramePesos = Number.parseFloat(orderPricingEdit.pricePerFramePesos)
        const clipOnly = Number.parseFloat(orderPricingEdit.clipOnly)
        const clipAndNarrator = Number.parseFloat(orderPricingEdit.clipAndNarrator)

        if (Number.isNaN(wordsPerFrame) || wordsPerFrame < 1 || wordsPerFrame > 100) {
            setOrderPricingMessage('Words per frame must be between 1 and 100.')
            return
        }

        if (Number.isNaN(pricePerFramePesos) || pricePerFramePesos < 0) {
            setOrderPricingMessage('TTS only price must be zero or greater.')
            return
        }

        if (Number.isNaN(clipOnly) || clipOnly < 0) {
            setOrderPricingMessage('Clip only price must be zero or greater.')
            return
        }

        if (Number.isNaN(clipAndNarrator) || clipAndNarrator < 0) {
            setOrderPricingMessage('Clip + narrator price must be zero or greater.')
            return
        }

        setOrderPricingSaving(true)
        setOrderPricingMessage(null)

        try {
            const updatedPricing = await studioApi.updateOrderPricing({
                wordsPerFrame,
                pricePerFramePesos,
                clipOnly,
                clipAndNarrator,
            })

            setStudioData((current) => {
                if (!current) {
                    return current
                }

                return {
                    ...current,
                    orderPricing: updatedPricing,
                }
            })

            setOrderPricingEdit(resolveOrderPricingEdit(updatedPricing))
            setOrderPricingMessage('Saved.')
        } catch {
            setOrderPricingMessage('Failed to update order pricing.')
        } finally {
            setOrderPricingSaving(false)
        }
    }, [orderPricingEdit])

    const handleProcessOrder = useCallback(async (orderId: string) => {
        if (processingOrderIds[orderId]) {
            return
        }

        setProcessingOrderIds((current) => ({
            ...current,
            [orderId]: true,
        }))
        setOrderActionMessage(null)

        try {
            const created = await studioApi.processOrder(orderId)
            setStudioData((current) => {
                if (!current) {
                    return current
                }

                return {
                    ...current,
                    orders: current.orders.map((order) =>
                        order.id === orderId ? { ...order, orderStatus: 'processing' } : order,
                    ),
                    reelJobs: [
                        {
                            id: created.jobId,
                            status: created.status,
                            progress: created.progress,
                            orderId,
                        },
                        ...current.reelJobs.filter((job) => job.id !== created.jobId),
                    ],
                }
            })
            setOrderActionMessage('Video processing queued.')
        } catch {
            setOrderActionMessage('Failed to queue video processing.')
        } finally {
            setProcessingOrderIds((current) => {
                const next = { ...current }
                delete next[orderId]
                return next
            })
        }
    }, [processingOrderIds])

    const handleDeleteOrder = useCallback(async (orderId: string) => {
        const confirmed = window.confirm(
            'Permanently delete this order and all its generated videos? This cannot be undone.',
        )
        if (!confirmed) {
            return
        }

        setDeletingOrderId(orderId)
        setOrderActionMessage(null)

        try {
            await studioApi.deleteOrder(orderId)

            setStudioData((current) => {
                if (!current) {
                    return current
                }

                return {
                    ...current,
                    orders: current.orders.filter((order) => order.id !== orderId),
                    reels: current.reels.filter((reel) => reel.orderId !== orderId),
                    reelJobs: current.reelJobs.filter((job) => job.orderId !== orderId),
                }
            })

            setProcessingOrderIds((current) => {
                const next = { ...current }
                delete next[orderId]
                return next
            })

            setOrderActionMessage('Order deleted.')
        } catch {
            setOrderActionMessage('Failed to delete order.')
        } finally {
            setDeletingOrderId(null)
        }
    }, [])

    if (isStudioRoute) {
        return (
            <Routes>
                <Route
                    path="/studio"
                    element={
                        <StudioPage
                            orders={studioData?.orders ?? []}
                            reels={studioData?.reels ?? []}
                            wordsPerFrame={studioData?.orderPricing?.wordsPerFrame}
                        />
                    }
                />
                <Route path="*" element={<Navigate to="/orders" replace />} />
            </Routes>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950 lg:p-6">
            <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3">
                {error ? <Alert color="failure">{error}</Alert> : null}

                <nav
                    className="sticky top-2 z-20 rounded-lg border border-gray-200 bg-white/90 p-1.5 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90"
                    aria-label="Primary"
                >
                    <div className="flex flex-wrap items-center gap-1">
                        <NavLink to="/orders" end className={({ isActive }) => topTabClass(isActive)}>
                            Orders
                        </NavLink>
                        <NavLink to="/settings" className={({ isActive }) => topTabClass(isActive)}>
                            Settings
                        </NavLink>

                        <span
                            className={`ml-auto inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold ${isMaintainanceModeOn
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                }`}
                            title="Customer site maintenance mode status"
                            aria-live="polite"
                        >
                            Maintenance: {isMaintainanceModeOn ? 'ON' : 'OFF'}
                        </span>
                    </div>
                </nav>

                <Routes>
                    <Route path="/" element={<Navigate to="/orders" replace />} />
                    <Route
                        path="/orders"
                        element={
                            <OrdersPage
                                orderPricing={studioData?.orderPricing ?? null}
                                reels={studioData?.reels ?? []}
                                processingOrderIds={processingOrderIds}
                                deletingOrderId={deletingOrderId}
                                orderActionMessage={orderActionMessage}
                                onProcessOrder={handleProcessOrder}
                                onDeleteOrder={handleDeleteOrder}
                            />
                        }
                    />
                    <Route path="/orders/:orderId/output" element={<OrderOutputPage />} />
                    <Route path="/settings" element={<SettingsLayout />}>
                        <Route index element={<Navigate to="accounts" replace />} />
                        <Route path="accounts" element={<SettingsAccountsPage studioData={studioData} />} />
                        <Route path="niches" element={<SettingsNichesPage studioData={studioData} />} />
                        <Route path="pipelines" element={<SettingsPipelinesPage studioData={studioData} />} />
                        <Route
                            path="fonts"
                            element={
                                <SettingsFontsPage
                                    studioData={studioData}
                                    fontUploading={fontUploading}
                                    fontSavingId={fontSavingId}
                                    fontDeletingId={fontDeletingId}
                                    fontMessage={fontMessage}
                                    onUploadFont={handleUploadFont}
                                    onUpdateFontName={handleUpdateFontName}
                                    onDeleteFont={handleDeleteFont}
                                />
                            }
                        />
                        <Route
                            path="clips"
                            element={
                                <SettingsClipsPage
                                    studioData={studioData}
                                    clipsBusyType={clipsBusyType}
                                    deletingClipId={deletingClipId}
                                    clipsMessage={clipsMessage}
                                    onUploadGameClip={handleUploadGameClip}
                                    onUploadOrderClip={handleUploadOrderClip}
                                    onDeleteClip={handleDeleteClip}
                                />
                            }
                        />
                        <Route
                            path="payment"
                            element={
                                <SettingsPaymentPage
                                    studioData={studioData}
                                    paymentMethodsSaving={paymentMethodsSaving}
                                    paymentMethodsMessage={paymentMethodsMessage}
                                    onTogglePaymentMethodEnabled={handleTogglePaymentMethodEnabled}
                                    maintainanceModeSaving={maintainanceModeSaving}
                                    maintainanceModeMessage={maintainanceModeMessage}
                                    onToggleMaintainanceMode={handleToggleMaintainanceMode}
                                />
                            }
                        />
                        <Route
                            path="pricing"
                            element={
                                <SettingsPricingPage
                                    studioData={studioData}
                                    pricingEdit={orderPricingEdit}
                                    pricingSaving={orderPricingSaving}
                                    pricingMessage={orderPricingMessage}
                                    onPricingEditChange={handleOrderPricingEditChange}
                                    onSavePricing={handleSaveOrderPricing}
                                />
                            }
                        />
                        <Route
                            path="voices"
                            element={
                                <SettingsVoicesPage
                                    studioData={studioData}
                                    togglingVoiceId={voiceTogglingId}
                                    previewingVoiceId={voicePreviewingId}
                                    installingPiperVoiceId={voiceInstallingId}
                                    voiceActionMessage={voiceActionMessage}
                                    onToggleVoiceEnabled={handleToggleVoiceEnabled}
                                    onPreviewVoice={handlePreviewVoice}
                                    onInstallPiperVoice={handleInstallPiperVoice}
                                />
                            }
                        />
                        <Route
                            path="danger"
                            element={
                                <SettingsDangerPage
                                    dangerBusy={dangerBusy}
                                    dangerMessage={dangerMessage}
                                    onDeleteAllOrders={handleDeleteAllOrders}
                                />
                            }
                        />
                        <Route path="*" element={<Navigate to="accounts" replace />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/orders" replace />} />
                </Routes>
            </div>
        </div>
    )
}

export default App
