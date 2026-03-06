import { useMemo } from 'react'
import { LivePlayerProvider } from '@twick/live-player'
import { TimelineProvider, type ProjectJSON, type TrackJSON } from '@twick/timeline'
import VideoEditor, {
    DEFAULT_ELEMENT_COLORS,
    DEFAULT_TIMELINE_TICK_CONFIGS,
    DEFAULT_TIMELINE_ZOOM_CONFIG,
    INITIAL_TIMELINE_DATA,
} from '@twick/video-editor'
import '@twick/video-editor/dist/video-editor.css'
import type { StudioOutputSize } from '../api/types'

type StudioEditorProps = {
    outputSize: StudioOutputSize
    contextId: string
    script: string
    videoUrl?: string | null
    wordsPerFrame?: number | null
}

const PREVIEW_DIMENSIONS: Record<StudioOutputSize, { width: number; height: number }> = {
    phone: { width: 720, height: 1280 },
    tablet: { width: 1024, height: 768 },
    laptop: { width: 1280, height: 800 },
    desktop: { width: 1920, height: 1080 },
}

function splitScriptByWordsPerFrame(scriptText: string, wordsPerFrame: number): string[] {
    const words = scriptText.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
        return ['']
    }

    const chunks: string[] = []
    for (let index = 0; index < words.length; index += wordsPerFrame) {
        chunks.push(words.slice(index, index + wordsPerFrame).join(' '))
    }

    return chunks
}

export function StudioEditor({ outputSize, contextId, script, videoUrl, wordsPerFrame }: StudioEditorProps) {
    const { width, height } = PREVIEW_DIMENSIONS[outputSize]

    const timelineContextId = useMemo(() => contextId.trim() || 'studio', [contextId])

    const initialData = useMemo(() => {
        const normalizedVideoUrl = (videoUrl ?? '').trim()
        const scriptText = script.trim()
        const words = scriptText.split(/\s+/).filter(Boolean).length
        const duration = Math.max(8, Math.min(180, words > 0 ? Math.ceil(words / 2) : 20))
        const normalizedWordsPerFrame =
            typeof wordsPerFrame === 'number' && Number.isFinite(wordsPerFrame)
                ? Math.max(1, Math.floor(wordsPerFrame))
                : 4
        const scriptChunks = splitScriptByWordsPerFrame(scriptText, normalizedWordsPerFrame)
        const chunkDuration = duration / scriptChunks.length

        const textTrackId = `t-text-${timelineContextId}`
        const videoTrackId = `t-video-${timelineContextId}`
        const videoElementId = `e-video-${timelineContextId}`

        const tracks: TrackJSON[] = [
            {
                type: 'element',
                id: textTrackId,
                name: 'script',
                elements: scriptChunks.map((chunk, index) => {
                    const start = index * chunkDuration
                    const end = index === scriptChunks.length - 1 ? duration : (index + 1) * chunkDuration

                    return {
                        id: `e-text-${timelineContextId}-${index + 1}`,
                        trackId: textTrackId,
                        name: `script-${index + 1}`,
                        type: 'text',
                        s: start,
                        e: end,
                        zIndex: 10,
                        props: {
                            text: chunk,
                            fill: '#FFFFFF',
                            textAlign: 'center',
                        },
                    }
                }),
            },
        ]

        if (normalizedVideoUrl) {
            tracks.unshift({
                type: 'element',
                id: videoTrackId,
                name: 'order-video',
                elements: [
                    {
                        id: videoElementId,
                        trackId: videoTrackId,
                        name: 'order-video',
                        type: 'video',
                        s: 0,
                        e: duration,
                        zIndex: 1,
                        objectFit: 'cover',
                        frame: {
                            x: 0,
                            y: 0,
                            width,
                            height,
                            size: [width, height],
                        },
                        props: {
                            src: normalizedVideoUrl,
                            playbackRate: 1,
                            volume: 1,
                        },
                    },
                ],
            })
        }

        const nextData: ProjectJSON = {
            version: INITIAL_TIMELINE_DATA.version,
            tracks,
        }
        return nextData
    }, [script, timelineContextId, videoUrl, width, height, wordsPerFrame])

    return (
        <div className="h-full w-full min-h-0 overflow-hidden [&_.twick-editor-container]:h-full [&_.twick-editor-main-container]:h-full [&_.twick-editor-main-container]:overflow-hidden [&_.twick-editor-main-container]:rounded-none [&_.twick-editor-main-container]:border-0">
            <LivePlayerProvider>
                <TimelineProvider
                    key={timelineContextId}
                    contextId={timelineContextId}
                    initialData={initialData}
                    resolution={{ width, height }}
                >
                    <VideoEditor
                        leftPanel={null}
                        rightPanel={null}
                        editorConfig={{
                            videoProps: {
                                width,
                                height,
                            },
                            timelineTickConfigs: DEFAULT_TIMELINE_TICK_CONFIGS,
                            timelineZoomConfig: DEFAULT_TIMELINE_ZOOM_CONFIG,
                            elementColors: DEFAULT_ELEMENT_COLORS,
                        }}
                        defaultPlayControls
                    />
                </TimelineProvider>
            </LivePlayerProvider>
        </div>
    )
}