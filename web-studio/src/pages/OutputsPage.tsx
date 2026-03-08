import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Card, Spinner } from 'flowbite-react'
import { Link } from 'react-router-dom'
import { apiBaseUrl } from '../api/client'
import { studioApi } from '../api/studioApi'
import type { ReelItem } from '../api/types'

type OutputDraft = {
    showcase: boolean
    showcaseTitle: string
    showcaseDescription: string
}

function toMediaUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path
    }

    return `${apiBaseUrl}${path}`
}

function formatDateTime(value: string): string {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
        return 'Unknown date'
    }

    return parsed.toLocaleString()
}

function createDraft(reel: ReelItem): OutputDraft {
    return {
        showcase: reel.showcase === true,
        showcaseTitle: reel.showcaseTitle ?? '',
        showcaseDescription: reel.showcaseDescription ?? '',
    }
}

export function OutputsPage() {
    const [outputs, setOutputs] = useState<ReelItem[]>([])
    const [drafts, setDrafts] = useState<Record<string, OutputDraft>>({})
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [savingById, setSavingById] = useState<Record<string, boolean>>({})

    const loadOutputs = useCallback(async (isRefresh = false) => {
        if (isRefresh) {
            setRefreshing(true)
        } else {
            setLoading(true)
        }
        setError(null)

        try {
            const reels = await studioApi.listReels()
            setOutputs(reels)
            setDrafts(() => {
                const next: Record<string, OutputDraft> = {}
                reels.forEach((reel) => {
                    next[reel.id] = createDraft(reel)
                })
                return next
            })
        } catch {
            setError('Failed to load outputs.')
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }, [])

    useEffect(() => {
        void loadOutputs(false)
    }, [loadOutputs])

    const sortedOutputs = useMemo(() => {
        return [...outputs].sort(
            (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        )
    }, [outputs])

    const persistDraft = useCallback(async (reelId: string, draft: OutputDraft, successMessage: string) => {
        setSavingById((current) => ({
            ...current,
            [reelId]: true,
        }))
        setError(null)

        const trimmedTitle = draft.showcaseTitle.trim()
        const trimmedDescription = draft.showcaseDescription.trim()

        try {
            await studioApi.updateReelShowcase(reelId, {
                showcase: draft.showcase,
                showcaseTitle: trimmedTitle,
                showcaseDescription: trimmedDescription,
            })

            setOutputs((current) => current.map((reel) =>
                reel.id === reelId
                    ? {
                        ...reel,
                        showcase: draft.showcase,
                        showcaseTitle: trimmedTitle,
                        showcaseDescription: trimmedDescription,
                    }
                    : reel,
            ))

            setDrafts((current) => ({
                ...current,
                [reelId]: {
                    ...draft,
                    showcaseTitle: trimmedTitle,
                    showcaseDescription: trimmedDescription,
                },
            }))

            setMessage(successMessage)
        } catch {
            setError('Failed to update output metadata.')
        } finally {
            setSavingById((current) => {
                const next = { ...current }
                delete next[reelId]
                return next
            })
        }
    }, [])

    const handleFieldChange = useCallback((reelId: string, patch: Partial<OutputDraft>) => {
        setDrafts((current) => {
            const previous = current[reelId] ?? {
                showcase: false,
                showcaseTitle: '',
                showcaseDescription: '',
            }

            return {
                ...current,
                [reelId]: {
                    ...previous,
                    ...patch,
                },
            }
        })
    }, [])

    const handleToggleStar = useCallback((reelId: string) => {
        const current = drafts[reelId]
        if (!current) {
            return
        }

        const next = {
            ...current,
            showcase: !current.showcase,
        }

        setDrafts((state) => ({
            ...state,
            [reelId]: next,
        }))

        void persistDraft(
            reelId,
            next,
            next.showcase ? 'Output starred for showcase.' : 'Output unstarred from showcase.',
        )
    }, [drafts, persistDraft])

    const handleSaveDetails = useCallback((reelId: string) => {
        const draft = drafts[reelId]
        if (!draft) {
            return
        }

        void persistDraft(reelId, draft, 'Output title and description saved.')
    }, [drafts, persistDraft])

    return (
        <>
            <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Outputs</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            Manage output showcase star, title, and description.
                        </p>
                    </div>

                    <div className="webstudio-inline-actions">
                        <button
                            type="button"
                            onClick={() => {
                                void loadOutputs(true)
                            }}
                            disabled={refreshing}
                            className="webstudio-inline-action rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            {refreshing ? 'Refreshing…' : 'Refresh'}
                        </button>
                        <Link
                            to="/orders"
                            className="webstudio-inline-action rounded-md border border-gray-300 px-3 py-1.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            Back to orders
                        </Link>
                    </div>
                </div>
            </Card>

            {message ? <Alert color="success">{message}</Alert> : null}
            {error ? <Alert color="failure">{error}</Alert> : null}

            {loading ? (
                <Card>
                    <div className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <Spinner size="sm" />
                        <span>Loading outputs...</span>
                    </div>
                </Card>
            ) : null}

            {!loading && sortedOutputs.length === 0 ? (
                <Card>
                    <p className="text-sm text-gray-600 dark:text-gray-300">No outputs found yet.</p>
                </Card>
            ) : null}

            {!loading && sortedOutputs.length > 0 ? (
                <div className="grid gap-2">
                    {sortedOutputs.map((reel) => {
                        const draft = drafts[reel.id] ?? createDraft(reel)
                        const isSaving = savingById[reel.id] === true

                        return (
                            <Card key={reel.id}>
                                <div className="grid gap-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                                Output {reel.id.slice(-12)}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                {formatDateTime(reel.createdAt)}
                                                {reel.orderId ? ` · order ${reel.orderId.slice(-12)}` : ''}
                                            </p>
                                        </div>
                                        <Badge color={draft.showcase ? 'warning' : 'gray'}>
                                            {draft.showcase ? 'Starred' : 'Not starred'}
                                        </Badge>
                                    </div>

                                    <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_auto] lg:items-start">
                                        <div className="space-y-2">
                                            <a
                                                href={toMediaUrl(reel.videoUrl)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="block rounded-md border border-gray-300 p-0.5 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
                                            >
                                                <video
                                                    src={toMediaUrl(reel.videoUrl)}
                                                    muted
                                                    playsInline
                                                    preload="metadata"
                                                    className="h-24 w-full rounded bg-black object-cover"
                                                />
                                            </a>

                                            <a
                                                href={toMediaUrl(reel.videoUrl)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                            >
                                                Open
                                            </a>
                                        </div>

                                        <div className="grid gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleToggleStar(reel.id)}
                                                disabled={isSaving}
                                                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition lg:hidden ${draft.showcase
                                                    ? 'border border-amber-500 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300'
                                                    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'} disabled:cursor-not-allowed disabled:opacity-70`}
                                            >
                                                {draft.showcase ? '★ Unstar' : '☆ Star'}
                                            </button>

                                            <label className="space-y-1">
                                                <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Title</span>
                                                <input
                                                    type="text"
                                                    value={draft.showcaseTitle}
                                                    onChange={(event) => handleFieldChange(reel.id, { showcaseTitle: event.target.value })}
                                                    disabled={isSaving}
                                                    className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                                />
                                            </label>

                                            <label className="space-y-1">
                                                <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Description</span>
                                                <textarea
                                                    rows={2}
                                                    value={draft.showcaseDescription}
                                                    onChange={(event) => handleFieldChange(reel.id, { showcaseDescription: event.target.value })}
                                                    disabled={isSaving}
                                                    className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                                />
                                            </label>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
                                            <button
                                                type="button"
                                                onClick={() => handleToggleStar(reel.id)}
                                                disabled={isSaving}
                                                className={`hidden rounded-md px-2.5 py-1.5 text-xs font-semibold transition lg:block ${draft.showcase
                                                    ? 'border border-amber-500 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300'
                                                    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'} disabled:cursor-not-allowed disabled:opacity-70`}
                                            >
                                                {draft.showcase ? '★ Unstar' : '☆ Star'}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleSaveDetails(reel.id)}
                                                disabled={isSaving}
                                                className="w-full rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70 lg:w-auto"
                                            >
                                                {isSaving ? 'Saving…' : 'Save details'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        )
                    })}
                </div>
            ) : null}
        </>
    )
}
