import { useMemo } from "react";
import { LivePlayerProvider } from "@twick/live-player";
import { TimelineProvider } from "@twick/timeline";
import VideoEditor, {
    DEFAULT_ELEMENT_COLORS,
    DEFAULT_TIMELINE_TICK_CONFIGS,
    DEFAULT_TIMELINE_ZOOM_CONFIG,
    INITIAL_TIMELINE_DATA,
} from "@twick/video-editor";
import "@twick/video-editor/dist/video-editor.css";
import type { StudioPreviewSize } from "../types";

type StudioTwickEditorProps = {
    previewSize: StudioPreviewSize;
    selectedOrderId?: string | null;
    selectedOrderOutputSize?: string | null;
    script: string;
};

const PREVIEW_DIMENSIONS: Record<StudioPreviewSize, { width: number; height: number }> = {
    phone: { width: 720, height: 1280 },
    tablet: { width: 1024, height: 768 },
    laptop: { width: 1280, height: 800 },
    desktop: { width: 1920, height: 1080 },
};

function normalizePreviewSize(value: string | null | undefined): StudioPreviewSize {
    if (value === "tablet" || value === "laptop" || value === "desktop") {
        return value;
    }
    return "phone";
}

export function StudioTwickEditor({
    previewSize,
    selectedOrderId,
    selectedOrderOutputSize,
    script,
}: StudioTwickEditorProps) {
    const resolvedPreviewSize = selectedOrderOutputSize
        ? normalizePreviewSize(selectedOrderOutputSize)
        : previewSize;

    const { width, height } = PREVIEW_DIMENSIONS[resolvedPreviewSize];

    const timelineContextId = useMemo(
        () => (selectedOrderId ? `studio-order-${selectedOrderId}` : "studio-create"),
        [selectedOrderId],
    );

    const initialData = useMemo(() => {
        const scriptText = script.trim();
        const headline = scriptText ? scriptText.slice(0, 120) : "Start editing your timeline";

        return {
            ...INITIAL_TIMELINE_DATA,
            tracks: INITIAL_TIMELINE_DATA.tracks.map((track, trackIndex) => {
                const nextTrackId = `${track.id}-${timelineContextId}-${trackIndex}`;

                return {
                    ...track,
                    id: nextTrackId,
                    elements: track.elements.map((element, elementIndex) => ({
                        ...element,
                        id: `${element.id}-${timelineContextId}-${elementIndex}`,
                        trackId: nextTrackId,
                        props: {
                            ...element.props,
                            ...(typeof element.props?.text === "string" ? { text: headline } : {}),
                        },
                    })),
                };
            }),
        };
    }, [script, timelineContextId]);

    return (
        <div className="studio-twick-shell">
            <LivePlayerProvider>
                <TimelineProvider
                    key={timelineContextId}
                    contextId={timelineContextId}
                    initialData={initialData}
                    resolution={{ width, height }}
                >
                    <div className="studio-twick-editor">
                        <VideoEditor
                            leftPanel={null}
                            rightPanel={null}
                            editorConfig={{
                                videoProps: {
                                    width,
                                    height,
                                    backgroundColor: "#101114",
                                },
                                timelineTickConfigs: DEFAULT_TIMELINE_TICK_CONFIGS,
                                timelineZoomConfig: DEFAULT_TIMELINE_ZOOM_CONFIG,
                                elementColors: DEFAULT_ELEMENT_COLORS,
                            }}
                            defaultPlayControls
                        />
                    </div>
                </TimelineProvider>
            </LivePlayerProvider>
        </div>
    );
}
