import { useMemo, useRef, useState } from 'react'
import { Badge, Button, Card, ToggleSwitch } from 'flowbite-react'
import { NavLink, Outlet } from 'react-router-dom'
import type { StudioBootstrap } from '../api/types'
import { SETTINGS_SECTIONS } from './settingsSections'

type SettingsDataProps = {
    studioData: StudioBootstrap | null
}

type SettingsDangerPageProps = {
    dangerBusy: boolean
    dangerMessage: string | null
    onDeleteAllOrders: () => Promise<void>
    studioData: StudioBootstrap | null
    maintainanceModeSaving: boolean
    maintainanceModeMessage: string | null
    onToggleMaintainanceMode: (isOnMaintainanceMode: boolean) => Promise<void>
}

type SettingsVoicesPageProps = SettingsDataProps & {
    togglingVoiceId: string | null
    previewingVoiceId: string | null
    installingPiperVoiceId: string | null
    voiceActionMessage: string | null
    onToggleVoiceEnabled: (voiceId: string, enabled: boolean) => Promise<void>
    onPreviewVoice: (voiceId: string, text?: string) => Promise<void>
    onInstallPiperVoice: (voiceId: string) => Promise<void>
}

type SettingsPaymentPageProps = SettingsDataProps & {
    paymentMethodsSaving: boolean
    paymentMethodsMessage: string | null
    onTogglePaymentMethodEnabled: (paymentMethodId: string, enabled: boolean) => Promise<void>
}

type SettingsFontsPageProps = SettingsDataProps & {
    fontUploading: boolean
    fontSavingId: string | null
    fontDeletingId: string | null
    fontMessage: string | null
    onUploadFont: (file: File) => Promise<void>
    onUpdateFontName: (fontId: string, name: string) => Promise<void>
    onDeleteFont: (fontId: string) => Promise<void>
}

type SettingsClipType = 'game' | 'order'

type SettingsClipsPageProps = SettingsDataProps & {
    clipsBusyType: SettingsClipType | null
    deletingClipId: string | null
    clipsMessage: string | null
    onUploadGameClip: (file: File) => Promise<void>
    onUploadOrderClip: (file: File) => Promise<void>
    onDeleteClip: (clipType: SettingsClipType, clipId: string) => Promise<void>
}

export type SettingsPricingField = 'wordsPerFrame' | 'pricePerFramePesos' | 'clipOnly' | 'clipAndNarrator'

export type SettingsPricingEditState = Record<SettingsPricingField, string>

type SettingsPricingPageProps = SettingsDataProps & {
    pricingEdit: SettingsPricingEditState
    pricingSaving: boolean
    pricingMessage: string | null
    onPricingEditChange: (field: SettingsPricingField, value: string) => void
    onSavePricing: () => Promise<void>
}

const PLATFORM_ORDER = ['youtube', 'facebook', 'instagram'] as const

function formatDateTime(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        return '—'
    }

    return date.toLocaleString()
}

function formatFileSize(value: number | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return '—'
    }

    const units = ['B', 'KB', 'MB', 'GB']
    let size = value
    let unitIndex = 0
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024
        unitIndex += 1
    }

    const precision = unitIndex === 0 ? 0 : 1
    return `${size.toFixed(precision)} ${units[unitIndex]}`
}

function ClipThumbnail({ url, label }: { url: string; label: string }) {
    const videoRef = useRef<HTMLVideoElement | null>(null)

    return (
        <video
            ref={videoRef}
            src={url}
            muted
            playsInline
            preload="metadata"
            title={label}
            className="h-14 w-24 rounded-md border border-gray-200 bg-black object-cover dark:border-gray-700"
            onMouseEnter={() => {
                if (!videoRef.current) {
                    return
                }

                void videoRef.current.play().catch(() => { })
            }}
            onMouseLeave={() => {
                if (!videoRef.current) {
                    return
                }

                videoRef.current.pause()
                videoRef.current.currentTime = 0
            }}
        />
    )
}

function formatCurrency(value: number | null | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '—'
    }

    return `₱${value.toLocaleString()}`
}

function resolveOrderPricingValues(orderPricing: StudioBootstrap['orderPricing']) {
    const tiered = orderPricing?.pricePerFramePesosByTier
    const ttsOnly = tiered?.ttsOnly ?? orderPricing?.pricePerFramePesos
    const clipOnly = tiered?.clipOnly ?? orderPricing?.clipOnly ?? ttsOnly
    const clipAndNarrator = tiered?.clipAndNarrator ?? orderPricing?.clipAndNarrator ?? ttsOnly

    return {
        ttsOnly,
        clipOnly,
        clipAndNarrator,
    }
}

function sectionButtonClass(isActive: boolean, isDanger: boolean): string {
    if (isDanger) {
        if (isActive) {
            return 'inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-red-600 bg-red-600 px-3 py-2 text-sm font-medium text-white'
        }

        return 'inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 dark:border-red-800 dark:bg-gray-900 dark:text-red-300'
    }

    if (isActive) {
        return 'inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-medium text-white'
    }

    return 'inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200'
}

export function SettingsLayout() {
    return (
        <>
            <Card>
                <div className="mb-3">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Settings</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        Dashboard contains only the requested settings sections.
                    </p>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                    {SETTINGS_SECTIONS.map((item) => (
                        <NavLink
                            key={item.id}
                            to={`/settings/${item.id}`}
                            className={({ isActive }) => sectionButtonClass(isActive, item.id === 'danger')}
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </div>
            </Card>

            <Outlet />
        </>
    )
}

export function SettingsAccountsPage({ studioData }: SettingsDataProps) {
    const accounts = studioData?.accounts ?? []

    const accountGroups = PLATFORM_ORDER.map((platform) => ({
        platform,
        items: accounts.filter((account) => account.platform === platform),
    }))

    return (
        <Card>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Social Accounts</h3>
            <div className="mt-2 flex flex-wrap gap-2">
                <Badge color={studioData?.youtubeStatus.configured ? 'success' : 'warning'}>
                    YouTube {studioData?.youtubeStatus.configured ? 'configured' : 'not configured'}
                </Badge>
                <Badge color={studioData?.facebookStatus.configured ? 'success' : 'warning'}>
                    Facebook {studioData?.facebookStatus.configured ? 'configured' : 'not configured'}
                </Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
                {accountGroups.map((group) => (
                    <div key={group.platform} className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                        <p className="mb-2 text-sm font-semibold capitalize text-gray-900 dark:text-white">
                            {group.platform} ({group.items.length})
                        </p>
                        {group.items.length === 0 ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400">No accounts.</p>
                        ) : (
                            <ul className="space-y-2">
                                {group.items.map((account) => (
                                    <li
                                        key={account.id}
                                        className="rounded border border-gray-200 p-2 text-xs dark:border-gray-700"
                                    >
                                        <p className="font-medium text-gray-900 dark:text-white">{account.label || account.id}</p>
                                        <p className="text-gray-500 dark:text-gray-400">{account.id}</p>
                                        <Badge color={account.connected ? 'success' : 'warning'} className="mt-1">
                                            {account.connected ? 'connected' : 'disconnected'}
                                        </Badge>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ))}
            </div>
        </Card>
    )
}

export function SettingsNichesPage({ studioData }: SettingsDataProps) {
    const niches = studioData?.niches ?? []

    return (
        <Card>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Content Niches</h3>
            {niches.length === 0 ? (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">No niches found.</p>
            ) : (
                <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                        <thead className="bg-gray-100 dark:bg-gray-900">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold">Label</th>
                                <th className="px-3 py-2 text-left font-semibold">Keywords</th>
                                <th className="px-3 py-2 text-left font-semibold">Feeds</th>
                                <th className="px-3 py-2 text-left font-semibold">Created</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {niches.map((niche) => (
                                <tr key={niche.id}>
                                    <td className="px-3 py-2">{niche.label}</td>
                                    <td className="px-3 py-2">{niche.keywords || '—'}</td>
                                    <td className="px-3 py-2">{niche.rssFeeds.length}</td>
                                    <td className="px-3 py-2">{formatDateTime(niche.createdAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    )
}

export function SettingsPipelinesPage({ studioData }: SettingsDataProps) {
    const pipelines = studioData?.pipelines ?? []

    return (
        <Card>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Auto Pipelines</h3>
            {pipelines.length === 0 ? (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">No pipelines found.</p>
            ) : (
                <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                        <thead className="bg-gray-100 dark:bg-gray-900">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold">Label</th>
                                <th className="px-3 py-2 text-left font-semibold">Enabled</th>
                                <th className="px-3 py-2 text-left font-semibold">Niche</th>
                                <th className="px-3 py-2 text-left font-semibold">Facebook account</th>
                                <th className="px-3 py-2 text-left font-semibold">Interval</th>
                                <th className="px-3 py-2 text-left font-semibold">Voice</th>
                                <th className="px-3 py-2 text-left font-semibold">Font</th>
                                <th className="px-3 py-2 text-left font-semibold">Last run</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {pipelines.map((pipeline) => (
                                <tr key={pipeline.id}>
                                    <td className="px-3 py-2">{pipeline.label || pipeline.id}</td>
                                    <td className="px-3 py-2">
                                        <Badge color={pipeline.enabled ? 'success' : 'warning'}>
                                            {pipeline.enabled ? 'enabled' : 'disabled'}
                                        </Badge>
                                    </td>
                                    <td className="px-3 py-2">{pipeline.nicheId || '—'}</td>
                                    <td className="px-3 py-2">{pipeline.facebookAccountId || '—'}</td>
                                    <td className="px-3 py-2">{pipeline.intervalHours}h</td>
                                    <td className="px-3 py-2">{pipeline.voiceName || '—'}</td>
                                    <td className="px-3 py-2">{pipeline.fontName || '—'}</td>
                                    <td className="px-3 py-2">
                                        {pipeline.lastRunStatus
                                            ? `${pipeline.lastRunStatus} (${pipeline.lastRunAt || '—'})`
                                            : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    )
}

export function SettingsFontsPage({
    studioData,
    fontUploading,
    fontSavingId,
    fontDeletingId,
    fontMessage,
    onUploadFont,
    onUpdateFontName,
    onDeleteFont,
}: SettingsFontsPageProps) {
    const fonts = studioData?.fonts.items ?? []
    const customFontsCount = fonts.filter((font) => font.source === 'custom').length
    const builtinFontsCount = fonts.filter((font) => font.source === 'builtin').length
    const customFonts = fonts.filter((font) => font.source === 'custom')
    const [fontUploadFile, setFontUploadFile] = useState<File | null>(null)
    const [editingFontId, setEditingFontId] = useState<string | null>(null)
    const [editingFontName, setEditingFontName] = useState('')
    const fontInputRef = useRef<HTMLInputElement | null>(null)

    const handleUploadFont = async () => {
        if (!fontUploadFile) {
            return
        }

        await onUploadFont(fontUploadFile)
        setFontUploadFile(null)
        if (fontInputRef.current) {
            fontInputRef.current.value = ''
        }
    }

    return (
        <Card>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Fonts</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Upload, rename, and remove custom fonts used by reel generation.
            </p>
            {fontMessage ? <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{fontMessage}</p> : null}

            <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Default font</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {studioData?.fonts.defaultFont || 'default'}
                    </p>
                </div>
                <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Custom fonts</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{customFontsCount}</p>
                </div>
                <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Builtin fonts</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{builtinFontsCount}</p>
                </div>
            </div>

            <label className="mt-4 block text-sm text-gray-700 dark:text-gray-300">
                Upload custom font (.ttf / .otf)
                <input
                    ref={fontInputRef}
                    type="file"
                    accept=".ttf,.otf"
                    disabled={fontUploading}
                    onChange={(event) => {
                        setFontUploadFile(event.target.files?.[0] ?? null)
                    }}
                    className="mt-1 block w-full text-xs text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white dark:text-gray-200"
                />
            </label>
            <div className="mt-2">
                <Button
                    color="blue"
                    disabled={!fontUploadFile || fontUploading}
                    onClick={() => {
                        void handleUploadFont()
                    }}
                >
                    {fontUploading ? 'Uploading…' : 'Upload font'}
                </Button>
            </div>

            <div className="mt-3 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                    <thead className="bg-gray-100 dark:bg-gray-900">
                        <tr>
                            <th className="px-3 py-2 text-left font-semibold">Name</th>
                            <th className="px-3 py-2 text-left font-semibold">Source</th>
                            <th className="px-3 py-2 text-left font-semibold">Filename</th>
                            <th className="px-3 py-2 text-left font-semibold">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {fonts.map((font) => {
                            const isCustom = font.source === 'custom'
                            const isEditing = editingFontId === font.id
                            const isSaving = fontSavingId === font.id
                            const isDeleting = fontDeletingId === font.id

                            return (
                                <tr key={font.id}>
                                    <td className="px-3 py-2">
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={editingFontName}
                                                onChange={(event) => setEditingFontName(event.target.value)}
                                                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                            />
                                        ) : (
                                            font.name
                                        )}
                                    </td>
                                    <td className="px-3 py-2">{font.source}</td>
                                    <td className="px-3 py-2">{font.filename || '—'}</td>
                                    <td className="px-3 py-2">
                                        {!isCustom ? (
                                            <span className="text-xs text-gray-500 dark:text-gray-400">Built-in</span>
                                        ) : isEditing ? (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    className="rounded-md border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-800 dark:bg-gray-900 dark:text-blue-300"
                                                    disabled={isSaving || editingFontName.trim().length === 0}
                                                    onClick={() => {
                                                        void onUpdateFontName(font.id, editingFontName.trim())
                                                    }}
                                                >
                                                    {isSaving ? 'Saving…' : 'Save'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                                                    onClick={() => {
                                                        setEditingFontId(null)
                                                        setEditingFontName('')
                                                    }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                                                    onClick={() => {
                                                        setEditingFontId(font.id)
                                                        setEditingFontName(font.name)
                                                    }}
                                                >
                                                    Rename
                                                </button>
                                                <button
                                                    type="button"
                                                    className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800 dark:bg-gray-900 dark:text-red-300"
                                                    disabled={isDeleting}
                                                    onClick={() => {
                                                        void onDeleteFont(font.id)
                                                    }}
                                                >
                                                    {isDeleting ? 'Removing…' : 'Remove'}
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {customFonts.length === 0 ? (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">No custom fonts uploaded yet.</p>
            ) : null}
        </Card>
    )
}

export function SettingsClipsPage({
    studioData,
    clipsBusyType,
    deletingClipId,
    clipsMessage,
    onUploadGameClip,
    onUploadOrderClip,
    onDeleteClip,
}: SettingsClipsPageProps) {
    const clips = studioData?.clips ?? []
    const orderClips = studioData?.orderClips ?? []
    const [gameClipFile, setGameClipFile] = useState<File | null>(null)
    const [orderClipFile, setOrderClipFile] = useState<File | null>(null)
    const gameClipInputRef = useRef<HTMLInputElement | null>(null)
    const orderClipInputRef = useRef<HTMLInputElement | null>(null)

    const gameUploading = clipsBusyType === 'game'
    const orderUploading = clipsBusyType === 'order'

    const handleUploadGameClip = async () => {
        if (!gameClipFile) {
            return
        }

        await onUploadGameClip(gameClipFile)
        setGameClipFile(null)
        if (gameClipInputRef.current) {
            gameClipInputRef.current.value = ''
        }
    }

    const handleUploadOrderClip = async () => {
        if (!orderClipFile) {
            return
        }

        await onUploadOrderClip(orderClipFile)
        setOrderClipFile(null)
        if (orderClipInputRef.current) {
            orderClipInputRef.current.value = ''
        }
    }

    return (
        <Card>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Clips</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Upload and remove game clips and order clips from one place.
            </p>

            {clipsMessage ? (
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{clipsMessage}</p>
            ) : null}

            <div className="mt-3 grid gap-4 xl:grid-cols-2">
                <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Game clips ({clips.length})</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Used in studio workflows and available clip catalog.
                    </p>

                    <label className="mt-3 block text-xs font-medium text-gray-700 dark:text-gray-300">
                        Upload game clip
                        <input
                            ref={gameClipInputRef}
                            type="file"
                            accept=".mp4,.mov,.mkv,.webm,.avi"
                            disabled={gameUploading}
                            onChange={(event) => {
                                setGameClipFile(event.target.files?.[0] ?? null)
                            }}
                            className="mt-1 block w-full text-xs text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white dark:text-gray-200"
                        />
                    </label>

                    <div className="mt-2">
                        <Button
                            color="blue"
                            disabled={!gameClipFile || gameUploading}
                            onClick={() => {
                                void handleUploadGameClip()
                            }}
                        >
                            {gameUploading ? 'Uploading…' : 'Upload game clip'}
                        </Button>
                    </div>

                    {clips.length === 0 ? (
                        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">No game clips.</p>
                    ) : (
                        <div className="mt-3 overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-xs dark:divide-gray-700">
                                <thead className="bg-gray-100 dark:bg-gray-900">
                                    <tr>
                                        <th className="px-2 py-2 text-left font-semibold">Preview</th>
                                        <th className="px-2 py-2 text-left font-semibold">Clip</th>
                                        <th className="px-2 py-2 text-left font-semibold">Size</th>
                                        <th className="px-2 py-2 text-left font-semibold">Created</th>
                                        <th className="px-2 py-2 text-left font-semibold">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {clips.map((clip) => (
                                        <tr key={clip.name}>
                                            <td className="px-2 py-2">
                                                <ClipThumbnail
                                                    url={clip.url}
                                                    label={clip.displayName || clip.name}
                                                />
                                            </td>
                                            <td className="px-2 py-2">
                                                <p className="font-medium text-gray-900 dark:text-white">
                                                    {clip.displayName || clip.name}
                                                </p>
                                                <p className="text-gray-500 dark:text-gray-400">{clip.name}</p>
                                            </td>
                                            <td className="px-2 py-2">{formatFileSize(clip.size)}</td>
                                            <td className="px-2 py-2">{formatDateTime(clip.createdAt)}</td>
                                            <td className="px-2 py-2">
                                                <button
                                                    type="button"
                                                    className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800 dark:bg-gray-900 dark:text-red-300"
                                                    disabled={deletingClipId === clip.name}
                                                    onClick={() => {
                                                        void onDeleteClip('game', clip.name)
                                                    }}
                                                >
                                                    {deletingClipId === clip.name ? 'Removing…' : 'Remove'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Order clips ({orderClips.length})
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Customer-uploaded clips used for order fulfillment.
                    </p>

                    <label className="mt-3 block text-xs font-medium text-gray-700 dark:text-gray-300">
                        Upload order clip
                        <input
                            ref={orderClipInputRef}
                            type="file"
                            accept=".mp4,.mov,.mkv,.webm,.avi"
                            disabled={orderUploading}
                            onChange={(event) => {
                                setOrderClipFile(event.target.files?.[0] ?? null)
                            }}
                            className="mt-1 block w-full text-xs text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white dark:text-gray-200"
                        />
                    </label>

                    <div className="mt-2">
                        <Button
                            color="blue"
                            disabled={!orderClipFile || orderUploading}
                            onClick={() => {
                                void handleUploadOrderClip()
                            }}
                        >
                            {orderUploading ? 'Uploading…' : 'Upload order clip'}
                        </Button>
                    </div>

                    {orderClips.length === 0 ? (
                        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">No order clips.</p>
                    ) : (
                        <div className="mt-3 overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-xs dark:divide-gray-700">
                                <thead className="bg-gray-100 dark:bg-gray-900">
                                    <tr>
                                        <th className="px-2 py-2 text-left font-semibold">Preview</th>
                                        <th className="px-2 py-2 text-left font-semibold">Clip</th>
                                        <th className="px-2 py-2 text-left font-semibold">Size</th>
                                        <th className="px-2 py-2 text-left font-semibold">Created</th>
                                        <th className="px-2 py-2 text-left font-semibold">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {orderClips.map((clip) => (
                                        <tr key={clip.name}>
                                            <td className="px-2 py-2">
                                                <ClipThumbnail
                                                    url={clip.url}
                                                    label={clip.displayName || clip.name}
                                                />
                                            </td>
                                            <td className="px-2 py-2">
                                                <p className="font-medium text-gray-900 dark:text-white">
                                                    {clip.displayName || clip.name}
                                                </p>
                                                <p className="text-gray-500 dark:text-gray-400">{clip.name}</p>
                                            </td>
                                            <td className="px-2 py-2">{formatFileSize(clip.size)}</td>
                                            <td className="px-2 py-2">{formatDateTime(clip.createdAt)}</td>
                                            <td className="px-2 py-2">
                                                <div className="flex items-center gap-2">
                                                    <a
                                                        href={clip.url}
                                                        download={clip.filename || clip.name}
                                                        className="rounded-md border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-gray-900 dark:text-blue-300"
                                                    >
                                                        Download
                                                    </a>
                                                    <button
                                                        type="button"
                                                        className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800 dark:bg-gray-900 dark:text-red-300"
                                                        disabled={deletingClipId === clip.name}
                                                        onClick={() => {
                                                            void onDeleteClip('order', clip.name)
                                                        }}
                                                    >
                                                        {deletingClipId === clip.name ? 'Removing…' : 'Remove'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </Card>
    )
}

export function SettingsPaymentPage({
    studioData,
    paymentMethodsSaving,
    paymentMethodsMessage,
    onTogglePaymentMethodEnabled,
}: SettingsPaymentPageProps) {
    const paymentMethods = studioData?.paymentMethods

    return (
        <Card>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Payment methods</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Enabled methods: {paymentMethods?.enabled.length ?? 0}
            </p>

            {paymentMethodsMessage ? (
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{paymentMethodsMessage}</p>
            ) : null}
            <div className="mt-3 space-y-2">
                {(paymentMethods?.options ?? []).map((option) => {
                    const enabled = paymentMethods?.enabled.includes(option.id) ?? false
                    return (
                        <div
                            key={option.id}
                            className="webstudio-settings-row rounded-md border border-gray-200 p-3 dark:border-gray-700"
                        >
                            <div className="webstudio-settings-row-start">
                                <p className="text-sm font-medium text-gray-900 dark:text-white">{option.label}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{option.id}</p>
                            </div>
                            <div className="webstudio-settings-row-end">
                                <ToggleSwitch
                                    checked={enabled}
                                    disabled={paymentMethodsSaving}
                                    onChange={(checked) => {
                                        void onTogglePaymentMethodEnabled(option.id, checked)
                                    }}
                                    sizing="sm"
                                />
                                <Badge color={enabled ? 'success' : 'warning'}>
                                    {paymentMethodsSaving ? 'saving...' : enabled ? 'enabled' : 'disabled'}
                                </Badge>
                            </div>
                        </div>
                    )
                })}
            </div>
        </Card>
    )
}

export function SettingsPricingPage({
    studioData,
    pricingEdit,
    pricingSaving,
    pricingMessage,
    onPricingEditChange,
    onSavePricing,
}: SettingsPricingPageProps) {
    const orderPricing = studioData?.orderPricing ?? null
    const resolvedPricing = resolveOrderPricingValues(orderPricing)

    return (
        <Card>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Order pricing</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Update values used by `/api/orders/pricing` for order totals.
            </p>
            {pricingMessage ? <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{pricingMessage}</p> : null}

            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1 rounded-md border border-gray-200 p-3 dark:border-gray-700">
                    <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Words per frame</span>
                    <input
                        type="number"
                        min={1}
                        max={100}
                        value={pricingEdit.wordsPerFrame}
                        onChange={(event) => onPricingEditChange('wordsPerFrame', event.target.value)}
                        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                </label>

                <label className="space-y-1 rounded-md border border-gray-200 p-3 dark:border-gray-700">
                    <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">TTS only (₱ per frame)</span>
                    <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={pricingEdit.pricePerFramePesos}
                        onChange={(event) => onPricingEditChange('pricePerFramePesos', event.target.value)}
                        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                </label>

                <label className="space-y-1 rounded-md border border-gray-200 p-3 dark:border-gray-700">
                    <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Clip only (₱ per frame)</span>
                    <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={pricingEdit.clipOnly}
                        onChange={(event) => onPricingEditChange('clipOnly', event.target.value)}
                        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                </label>

                <label className="space-y-1 rounded-md border border-gray-200 p-3 dark:border-gray-700">
                    <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Clip + narrator (₱ per frame)
                    </span>
                    <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={pricingEdit.clipAndNarrator}
                        onChange={(event) => onPricingEditChange('clipAndNarrator', event.target.value)}
                        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                </label>
            </div>

            <div className="mt-3">
                <Button color="blue" disabled={pricingSaving} onClick={() => void onSavePricing()}>
                    {pricingSaving ? 'Saving…' : 'Save pricing'}
                </Button>
            </div>

            {orderPricing ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Current words/frame</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">{orderPricing.wordsPerFrame}</p>
                    </div>
                    <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Current TTS only</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(resolvedPricing.ttsOnly)}
                        </p>
                    </div>
                    <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Current clip only</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(resolvedPricing.clipOnly)}
                        </p>
                    </div>
                    <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            Current clip + narrator
                        </p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(resolvedPricing.clipAndNarrator)}
                        </p>
                    </div>
                </div>
            ) : (
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">No pricing record found.</p>
            )}
        </Card>
    )
}

export function SettingsVoicesPage({
    studioData,
    togglingVoiceId,
    previewingVoiceId,
    installingPiperVoiceId,
    voiceActionMessage,
    onToggleVoiceEnabled,
    onPreviewVoice,
    onInstallPiperVoice,
}: SettingsVoicesPageProps) {
    const settingsVoices = studioData?.settingsVoices ?? []
    const allVoices = studioData?.voices
    const [previewText, setPreviewText] = useState('')

    const edgeVoiceMetaById = useMemo(() => {
        return new Map((allVoices?.edge ?? []).map((voice) => [voice.id, voice]))
    }, [allVoices?.edge])

    const installedPiperVoiceIds = useMemo(() => {
        return new Set((allVoices?.piper.installed ?? []).map((voice) => voice.id))
    }, [allVoices?.piper.installed])

    return (
        <Card>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Order voices</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Toggle voice availability, preview edge voices, and install Piper catalog voices.
            </p>

            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Default engine</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {allVoices?.defaultEngine ?? '—'}
                    </p>
                </div>
                <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Edge voices</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{allVoices?.edge.length ?? 0}</p>
                </div>
                <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Piper installed</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {allVoices?.piper.installed.length ?? 0}
                    </p>
                </div>
                <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">pyttsx3 voices</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{allVoices?.pyttsx3.length ?? 0}</p>
                </div>
            </div>

            {voiceActionMessage ? (
                <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">{voiceActionMessage}</p>
            ) : null}

            <label className="mt-3 block text-sm text-gray-700 dark:text-gray-300">
                Preview text (optional)
                <textarea
                    rows={2}
                    maxLength={500}
                    value={previewText}
                    onChange={(event) => setPreviewText(event.target.value)}
                    placeholder="Leave blank to use API sample text"
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
            </label>

            {settingsVoices.length === 0 ? (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">No voices found.</p>
            ) : (
                <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                        <thead className="bg-gray-100 dark:bg-gray-900">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold">Name</th>
                                <th className="px-3 py-2 text-left font-semibold">Locale</th>
                                <th className="px-3 py-2 text-left font-semibold">Country</th>
                                <th className="px-3 py-2 text-left font-semibold">Language</th>
                                <th className="px-3 py-2 text-left font-semibold">Gender</th>
                                <th className="px-3 py-2 text-left font-semibold">Preview</th>
                                <th className="px-3 py-2 text-left font-semibold">Enabled</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {settingsVoices.map((voice) => (
                                <tr key={voice.id}>
                                    <td className="px-3 py-2">{voice.name}</td>
                                    <td className="px-3 py-2">{voice.locale}</td>
                                    <td className="px-3 py-2">{voice.country}</td>
                                    <td className="px-3 py-2">{voice.language}</td>
                                    <td className="px-3 py-2">{voice.gender}</td>
                                    <td className="px-3 py-2">
                                        <button
                                            type="button"
                                            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                                            disabled={previewingVoiceId === voice.id}
                                            onClick={() => {
                                                const edgeMeta = edgeVoiceMetaById.get(voice.id)
                                                const fallbackSample = edgeMeta?.sample_text
                                                const textToUse = previewText.trim() || fallbackSample
                                                void onPreviewVoice(voice.id, textToUse)
                                            }}
                                        >
                                            {previewingVoiceId === voice.id ? 'Playing…' : 'Preview'}
                                        </button>
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-3">
                                            <ToggleSwitch
                                                checked={voice.enabled}
                                                disabled={togglingVoiceId === voice.id}
                                                onChange={(checked) => {
                                                    void onToggleVoiceEnabled(voice.id, checked)
                                                }}
                                                sizing="sm"
                                            />
                                            <Badge color={voice.enabled ? 'success' : 'warning'}>
                                                {togglingVoiceId === voice.id
                                                    ? 'saving...'
                                                    : voice.enabled
                                                        ? 'enabled'
                                                        : 'disabled'}
                                            </Badge>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="mt-6">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Piper catalog</h4>
                {(allVoices?.piper.catalog.length ?? 0) === 0 ? (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">No Piper catalog items found.</p>
                ) : (
                    <div className="mt-2 overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                            <thead className="bg-gray-100 dark:bg-gray-900">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">Voice</th>
                                    <th className="px-3 py-2 text-left font-semibold">Quality</th>
                                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                                    <th className="px-3 py-2 text-left font-semibold">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {allVoices?.piper.catalog.map((voice) => {
                                    const installed = voice.installed || installedPiperVoiceIds.has(voice.id)
                                    const installing = installingPiperVoiceId === voice.id
                                    return (
                                        <tr key={voice.id}>
                                            <td className="px-3 py-2">
                                                <p className="font-medium text-gray-900 dark:text-white">{voice.name}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{voice.id}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{voice.description}</p>
                                            </td>
                                            <td className="px-3 py-2 capitalize">{voice.quality}</td>
                                            <td className="px-3 py-2">
                                                <Badge color={installed ? 'success' : 'warning'}>
                                                    {installed ? 'installed' : 'not installed'}
                                                </Badge>
                                            </td>
                                            <td className="px-3 py-2">
                                                <button
                                                    type="button"
                                                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                                                    disabled={installed || installing}
                                                    onClick={() => {
                                                        void onInstallPiperVoice(voice.id)
                                                    }}
                                                >
                                                    {installing ? 'Installing…' : installed ? 'Installed' : 'Install'}
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Card>
    )
}

export function SettingsDangerPage({
    dangerBusy,
    dangerMessage,
    onDeleteAllOrders,
    studioData,
    maintainanceModeSaving,
    maintainanceModeMessage,
    onToggleMaintainanceMode,
}: SettingsDangerPageProps) {
    const isOnMaintainanceMode = studioData?.isOnMaintainanceMode === true

    return (
        <Card>
            <h3 className="text-base font-semibold text-red-600">Danger zone</h3>
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                <div className="webstudio-settings-row">
                    <div className="webstudio-settings-row-start">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Maintainance mode</p>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                            Block the full `web-orders` customer UI and show a maintainance notice.
                        </p>
                    </div>
                    <div className="webstudio-settings-row-end">
                        <ToggleSwitch
                            checked={isOnMaintainanceMode}
                            disabled={maintainanceModeSaving}
                            onChange={(checked) => {
                                void onToggleMaintainanceMode(checked)
                            }}
                            sizing="sm"
                        />
                        <Badge color={isOnMaintainanceMode ? 'warning' : 'success'}>
                            {maintainanceModeSaving ? 'saving...' : isOnMaintainanceMode ? 'enabled' : 'disabled'}
                        </Badge>
                    </div>
                </div>
                {maintainanceModeMessage ? (
                    <p className="mt-2 text-xs text-gray-700 dark:text-gray-300">{maintainanceModeMessage}</p>
                ) : null}
            </div>
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                Permanently delete all orders, order-generated reels, and customer-uploaded order clips.
            </p>
            <div className="mt-3">
                <Button className="webstudio-inline-action" color="failure" disabled={dangerBusy} onClick={() => void onDeleteAllOrders()}>
                    {dangerBusy ? 'Deleting…' : 'Delete all orders and order-related data'}
                </Button>
            </div>
            {dangerMessage ? (
                <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">{dangerMessage}</p>
            ) : null}
        </Card>
    )
}
