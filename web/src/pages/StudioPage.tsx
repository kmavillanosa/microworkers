import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import {
    STUDIO_PREVIEW_SIZES,
    orderFramesAndPrice,
    orderOutputSizeLabel,
    orderPaymentLine,
    scriptToFrameTexts,
    studioPreviewSizeFromDimensions,
    truncateMiddle,
} from "../helpers";
import { useAppStore } from "../stores/useAppStore";
import type { Order, OrderStatus, StudioPreviewSize } from "../types";

type VoiceEngine = "edge" | "piper" | "pyttsx3" | "none";
type BackgroundMode = "clip" | "auto" | "caption";

type ReelQueueResponse = {
    jobId: string;
    status: "queued" | "processing" | "completed" | "failed";
    progress: number;
};

type ReelCreatePayload = {
    script: string;
    title?: string;
    clipName?: string;
    fontName?: string;
    voiceEngine?: VoiceEngine;
    voiceName?: string;
    voiceRate?: number;
    bgMode?: BackgroundMode;
    orderId?: string;
    outputSize?: "phone" | "tablet" | "laptop" | "desktop";
    scriptPosition?: "top" | "center" | "bottom";
    scriptStyle?: {
        fontScale?: number;
        bgOpacity?: number;
    };
};

const OUTPUT_SIZE_OPTIONS = new Set(["phone", "tablet", "laptop", "desktop"]);
const SCRIPT_POSITION_OPTIONS = new Set(["top", "center", "bottom"]);

function isVoiceEngine(value: string | null | undefined): value is VoiceEngine {
    return value === "edge" || value === "piper" || value === "pyttsx3" || value === "none";
}

function getApiErrorMessage(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") return null;
    const maybeMessage = (payload as { message?: unknown }).message;
    if (typeof maybeMessage === "string") return maybeMessage;
    if (Array.isArray(maybeMessage)) {
        const text = maybeMessage
            .filter((item): item is string => typeof item === "string")
            .join("; ");
        return text || null;
    }
    return null;
}

export function StudioPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const {
        apiBaseUrl,
        clips,
        fonts,
        edgeVoices,
        jobs,
        reels,
        orderPricing,
        orderClipTranscripts,
        orderUseClipAudio,
        orderUseClipAudioWithNarrator,
        setOrderUseClipAudio,
        setOrderUseClipAudioWithNarrator,
        loadClips,
        loadVoices,
        loadFonts,
        loadReels,
        loadOrders,
        loadActiveJobs,
        loadOrderClipTranscripts,
        handleSetOrderStatus,
    } = useAppStore(useShallow((state) => ({
        apiBaseUrl: state.apiBaseUrl,
        clips: state.clips,
        fonts: state.fonts,
        edgeVoices: state.edgeVoices,
        jobs: state.jobs,
        reels: state.reels,
        orderPricing: state.orderPricing,
        orderClipTranscripts: state.orderClipTranscripts,
        orderUseClipAudio: state.orderUseClipAudio,
        orderUseClipAudioWithNarrator: state.orderUseClipAudioWithNarrator,
        setOrderUseClipAudio: state.setOrderUseClipAudio,
        setOrderUseClipAudioWithNarrator: state.setOrderUseClipAudioWithNarrator,
        loadClips: state.loadClips,
        loadVoices: state.loadVoices,
        loadFonts: state.loadFonts,
        loadReels: state.loadReels,
        loadOrders: state.loadOrders,
        loadActiveJobs: state.loadActiveJobs,
        loadOrderClipTranscripts: state.loadOrderClipTranscripts,
        handleSetOrderStatus: state.handleSetOrderStatus,
    })));

    const [script, setScript] = useState("");
    const [title, setTitle] = useState("");
    const [bgMode, setBgMode] = useState<BackgroundMode>("auto");
    const [selectedClipName, setSelectedClipName] = useState("");
    const [selectedFontName, setSelectedFontName] = useState("");
    const [voiceEngine, setVoiceEngine] = useState<VoiceEngine>("edge");
    const [selectedVoiceId, setSelectedVoiceId] = useState("");
    const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);

    const [isUploading, setIsUploading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");

    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    const [studioPreviewFrameIndex, setStudioPreviewFrameIndex] = useState(0);
    const [studioPreviewSize, setStudioPreviewSize] =
        useState<StudioPreviewSize>("phone");
    const [studioPreviewMuted, setStudioPreviewMuted] = useState(true);
    const [studioScriptPosition, setStudioScriptPosition] = useState<
        "top" | "center" | "bottom"
    >("bottom");
    const [studioScriptStyle, setStudioScriptStyle] = useState<{
        fontScale?: number;
        bgOpacity?: number;
    }>({ fontScale: 1, bgOpacity: 180 });

    const orderIdFromUrl = searchParams.get("orderId")?.trim() ?? "";

    useEffect(() => {
        if (clips.length === 0) void loadClips();
        if (fonts.length === 0) void loadFonts();
        if (edgeVoices.length === 0) void loadVoices();
    }, [clips.length, edgeVoices.length, fonts.length, loadClips, loadFonts, loadVoices]);

    useEffect(() => {
        if (!selectedClipName && clips.length > 0) {
            setSelectedClipName(clips[0].name);
        }
    }, [clips, selectedClipName]);

    useEffect(() => {
        if (!selectedFontName) {
            if (fonts.length > 0) {
                setSelectedFontName(fonts[0].id);
            } else {
                setSelectedFontName("default");
            }
        }
    }, [fonts, selectedFontName]);

    useEffect(() => {
        if (voiceEngine === "edge" && !selectedVoiceId && edgeVoices.length > 0) {
            setSelectedVoiceId(edgeVoices[0].id);
        }
    }, [edgeVoices, selectedVoiceId, voiceEngine]);

    useEffect(() => {
        if (!orderIdFromUrl) {
            setSelectedOrder(null);
            return;
        }

        let cancelled = false;

        void (async () => {
            try {
                const response = await fetch(`${apiBaseUrl}/api/orders/${encodeURIComponent(orderIdFromUrl)}`);
                if (!response.ok) {
                    if (!cancelled) {
                        setSelectedOrder(null);
                        setStatusMessage("Order not found.");
                    }
                    return;
                }

                const order = (await response.json()) as Order;
                if (cancelled) return;

                setSelectedOrder(order);
                setScript(order.script ?? "");
                setTitle(order.title ?? "");
                setSelectedClipName(order.clipName ?? "");
                setBgMode(order.clipName ? "clip" : "auto");
                setSelectedFontName(order.fontId || "default");
                setVoiceEngine(isVoiceEngine(order.voiceEngine) ? order.voiceEngine : "edge");
                setSelectedVoiceId(order.voiceName ?? "");

                if (
                    order.scriptPosition &&
                    SCRIPT_POSITION_OPTIONS.has(order.scriptPosition)
                ) {
                    setStudioScriptPosition(order.scriptPosition as "top" | "center" | "bottom");
                }

                setStudioScriptStyle({
                    fontScale:
                        typeof order.scriptStyle?.fontScale === "number"
                            ? order.scriptStyle.fontScale
                            : 1,
                    bgOpacity:
                        typeof order.scriptStyle?.bgOpacity === "number"
                            ? order.scriptStyle.bgOpacity
                            : 180,
                });

                setOrderUseClipAudio((prev) => ({
                    ...prev,
                    [order.id]: order.useClipAudio ?? false,
                }));
                setOrderUseClipAudioWithNarrator((prev) => ({
                    ...prev,
                    [order.id]: order.useClipAudioWithNarrator ?? false,
                }));

                if (order.clipName) {
                    await loadOrderClipTranscripts([order.clipName]);
                }
            } catch {
                if (!cancelled) {
                    setSelectedOrder(null);
                    setStatusMessage("Failed to load order details.");
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [
        apiBaseUrl,
        loadOrderClipTranscripts,
        orderIdFromUrl,
        setOrderUseClipAudio,
        setOrderUseClipAudioWithNarrator,
    ]);

    const studioFrameTexts = useMemo(
        () => scriptToFrameTexts(script, orderPricing?.wordsPerFrame ?? 5),
        [orderPricing?.wordsPerFrame, script],
    );

    useEffect(() => {
        const totalFrames = studioFrameTexts.length;
        setStudioPreviewFrameIndex((prev) => {
            if (totalFrames === 0) return 0;
            return prev >= totalFrames ? totalFrames - 1 : prev;
        });
    }, [studioFrameTexts.length]);

    const selectedClip = useMemo(
        () => clips.find((clip) => clip.name === selectedClipName),
        [clips, selectedClipName],
    );

    const clipPreviewUrl = useMemo(() => {
        const rawPath = selectedClip?.url
            ? selectedClip.url
            : selectedClipName
                ? `/media/order-clips/${encodeURIComponent(selectedClipName)}`
                : null;
        if (!rawPath) return null;
        if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
            return rawPath;
        }
        return `${apiBaseUrl}${rawPath}`;
    }, [apiBaseUrl, selectedClip?.url, selectedClipName]);

    const studioOrderClipName = selectedOrder?.clipName ?? null;
    const studioTranscriptInfo = studioOrderClipName
        ? orderClipTranscripts[studioOrderClipName]
        : null;
    const studioTranscriptReady = studioTranscriptInfo?.status === "completed";
    const hasSelectedOrderClip = Boolean(selectedOrder?.id && studioOrderClipName);

    const studioUseClipAudio = hasSelectedOrderClip
        ? (orderUseClipAudio[selectedOrder!.id] ?? selectedOrder!.useClipAudio ?? false)
        : false;

    const studioUseClipAudioWithNarrator = hasSelectedOrderClip
        ? (orderUseClipAudioWithNarrator[selectedOrder!.id] ??
            selectedOrder!.useClipAudioWithNarrator ??
            false)
        : false;

    const selectedOrderReels = useMemo(
        () =>
            selectedOrder
                ? reels.filter((reel) => reel.orderId === selectedOrder.id)
                : [],
        [reels, selectedOrder],
    );

    const activeStudioJob = useMemo(() => {
        if (selectedOrder) {
            const selectedOrderJob = jobs.find(
                (job) =>
                    (job.status === "processing" || job.status === "queued") &&
                    job.orderId === selectedOrder.id,
            );
            if (selectedOrderJob) return selectedOrderJob;
        }

        return (
            jobs.find((job) => job.status === "processing" || job.status === "queued") ??
            null
        );
    }, [jobs, selectedOrder]);

    const previewFontFamily = useMemo(
        () =>
            selectedFontName && selectedFontName !== "default"
                ? `"${selectedFontName}", "Segoe UI", Arial, sans-serif`
                : '"Segoe UI", Arial, sans-serif',
        [selectedFontName],
    );

    const previewCaptionText = useMemo(() => {
        if (studioFrameTexts.length > 0) {
            return studioFrameTexts[studioPreviewFrameIndex] ?? studioFrameTexts[0];
        }

        const trimmed = script.trim();
        if (!trimmed) return "Your script will appear here";

        const firstSentence = trimmed.split(/[.!?]/)[0]?.trim() ?? "";
        return firstSentence ? `${firstSentence.slice(0, 60)}…` : trimmed.slice(0, 60);
    }, [script, studioFrameTexts, studioPreviewFrameIndex]);

    const effectiveScriptPosition = useMemo(() => {
        if (selectedOrder?.scriptPosition && SCRIPT_POSITION_OPTIONS.has(selectedOrder.scriptPosition)) {
            return selectedOrder.scriptPosition as "top" | "center" | "bottom";
        }
        return studioScriptPosition;
    }, [selectedOrder?.scriptPosition, studioScriptPosition]);

    const effectiveScriptStyle = useMemo(() => {
        if (selectedOrder?.scriptStyle) {
            return {
                fontScale:
                    typeof selectedOrder.scriptStyle.fontScale === "number"
                        ? selectedOrder.scriptStyle.fontScale
                        : 1,
                bgOpacity:
                    typeof selectedOrder.scriptStyle.bgOpacity === "number"
                        ? selectedOrder.scriptStyle.bgOpacity
                        : 180,
            };
        }
        return studioScriptStyle;
    }, [selectedOrder?.scriptStyle, studioScriptStyle]);

    const previewCaptionStyle = useMemo<CSSProperties>(() => {
        const style: CSSProperties = {
            fontFamily: previewFontFamily,
            fontSize: `${10 * (effectiveScriptStyle.fontScale ?? 1)}px`,
            background: `rgba(0, 0, 0, ${Math.max(0, Math.min(255, effectiveScriptStyle.bgOpacity ?? 180)) / 255})`,
        };

        if (effectiveScriptPosition === "top") {
            style.top = "12%";
            style.bottom = "auto";
            style.transform = "none";
        } else if (effectiveScriptPosition === "center") {
            style.top = "50%";
            style.bottom = "auto";
            style.transform = "translateY(-50%)";
        } else {
            style.top = "auto";
            style.bottom = "12%";
            style.transform = "none";
        }

        return style;
    }, [effectiveScriptPosition, effectiveScriptStyle.bgOpacity, effectiveScriptStyle.fontScale, previewFontFamily]);

    async function handleUpload() {
        if (!selectedFiles?.length) {
            setStatusMessage("Select one or more clips first.");
            return;
        }

        setIsUploading(true);
        setStatusMessage("");

        try {
            const formData = new FormData();
            Array.from(selectedFiles).forEach((file) => {
                formData.append("files", file);
            });

            const response = await fetch(`${apiBaseUrl}/api/clips/upload`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => null);
                throw new Error(getApiErrorMessage(payload) ?? "Upload failed");
            }

            await loadClips();
            setSelectedFiles(null);
            setStatusMessage("Clips uploaded.");
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : "Upload failed.");
        } finally {
            setIsUploading(false);
        }
    }

    async function handleCreateReel(event: FormEvent) {
        event.preventDefault();

        const trimmedScript = script.trim();
        if (!trimmedScript && !studioUseClipAudio) {
            setStatusMessage("Script is required.");
            return;
        }

        if (bgMode === "clip" && !selectedClipName) {
            setStatusMessage("Select a clip or choose a different background mode.");
            return;
        }

        const shouldProcessSelectedOrderClip =
            hasSelectedOrderClip && (studioUseClipAudio || studioUseClipAudioWithNarrator);

        if (shouldProcessSelectedOrderClip && selectedOrder) {
            if (!studioTranscriptReady && !trimmedScript) {
                setStatusMessage(
                    studioUseClipAudioWithNarrator
                        ? "Enter a script for narrator mode, or wait for transcript."
                        : "Transcript not ready yet for this clip.",
                );
                return;
            }

            setIsCreating(true);
            setStatusMessage("");

            try {
                alert("HERE!!");
                const response = await fetch(
                    `https://reelagad.com/api/orders/${encodeURIComponent(selectedOrder.id)}/process`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            useClipAudio: true,
                            ...(studioUseClipAudioWithNarrator && { useClipAudioWithNarrator: true }),
                            ...(trimmedScript && { script: trimmedScript }),
                        }),
                    },
                );

                if (!response.ok) {
                    const payload = await response.json().catch(() => null);
                    throw new Error(getApiErrorMessage(payload) ?? "Failed to queue order processing.");
                }

                await Promise.all([loadActiveJobs(), loadOrders(), loadReels()]);
                await handleSetOrderStatus(selectedOrder.id, "processing");
                setSelectedOrder((prev) =>
                    prev ? { ...prev, orderStatus: "processing" } : prev,
                );
                setStatusMessage("Order processing queued.");
            } catch (error) {
                setStatusMessage(error instanceof Error ? error.message : "Failed to process order.");
            } finally {
                setIsCreating(false);
            }

            return;
        }

        if (!trimmedScript) {
            setStatusMessage("Script is required.");
            return;
        }

        const payload: ReelCreatePayload = {
            script: trimmedScript,
            title: title.trim() || undefined,
            clipName: bgMode === "clip" ? selectedClipName : undefined,
            fontName: selectedFontName || undefined,
            voiceEngine,
            voiceName: voiceEngine === "none" ? undefined : selectedVoiceId || undefined,
            voiceRate: 180,
            bgMode,
        };

        if (selectedOrder) {
            payload.orderId = selectedOrder.id;
            payload.outputSize = OUTPUT_SIZE_OPTIONS.has(selectedOrder.outputSize ?? "")
                ? (selectedOrder.outputSize as "phone" | "tablet" | "laptop" | "desktop")
                : "phone";
            payload.scriptPosition = SCRIPT_POSITION_OPTIONS.has(selectedOrder.scriptPosition ?? "")
                ? (selectedOrder.scriptPosition as "top" | "center" | "bottom")
                : undefined;
            payload.scriptStyle = selectedOrder.scriptStyle ?? undefined;
        } else {
            payload.scriptPosition = studioScriptPosition;
            payload.scriptStyle =
                studioScriptStyle.fontScale !== 1 || studioScriptStyle.bgOpacity !== 180
                    ? studioScriptStyle
                    : undefined;
        }

        setIsCreating(true);
        setStatusMessage("");

        try {
            const response = await fetch(`${apiBaseUrl}/api/reels`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const payloadError = await response.json().catch(() => null);
                throw new Error(getApiErrorMessage(payloadError) ?? "Failed to create reel job.");
            }

            const created = (await response.json()) as ReelQueueResponse;
            await Promise.all([loadActiveJobs(), loadReels(), loadOrders()]);
            setStatusMessage(`Reel job queued (${created.jobId.slice(0, 8)}).`);

            if (!selectedOrder) {
                setScript("");
                setTitle("");
            }
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : "Failed to create reel job.");
        } finally {
            setIsCreating(false);
        }
    }

    async function handleSelectedOrderStatusChange(nextStatus: OrderStatus) {
        if (!selectedOrder) return;
        await handleSetOrderStatus(selectedOrder.id, nextStatus);
        setSelectedOrder((prev) => (prev ? { ...prev, orderStatus: nextStatus } : prev));
    }

    const generateDisabled =
        isCreating || (bgMode === "clip" && !selectedClipName);

    return (
        <div className="studio">
            <aside className="studio-sidebar">
                <div className="control-panel studio-control">
                    <h2 className="studio-control-title">Create</h2>

                    <form onSubmit={handleCreateReel} className="studio-form">
                        <section className="studio-block">
                            <label className="studio-label">Script</label>
                            <p className="studio-hint">
                                Paste your script, then fine-tune frame text in the timeline.
                            </p>

                            <textarea
                                className="studio-textarea"
                                placeholder="Your script…"
                                value={script}
                                onChange={(event) => setScript(event.target.value)}
                                rows={4}
                                aria-label="Reel script"
                            />

                            <input
                                type="text"
                                className="studio-input"
                                placeholder="Title (optional)"
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                aria-label="Project title"
                            />
                        </section>

                        <section className="studio-block">
                            <label className="studio-label">Scene</label>

                            <div className="studio-row">
                                <span className="studio-label-inline">Font</span>
                                <select
                                    className="studio-select"
                                    value={selectedFontName}
                                    onChange={(event) => setSelectedFontName(event.target.value)}
                                    aria-label="Video font"
                                    style={{ fontFamily: previewFontFamily }}
                                >
                                    {fonts.length === 0 ? (
                                        <option value="default">Default</option>
                                    ) : (
                                        fonts.map((font) => (
                                            <option key={font.id} value={font.id}>
                                                {font.name}
                                            </option>
                                        ))
                                    )}
                                </select>
                            </div>

                            <div className="studio-pills">
                                <button
                                    type="button"
                                    className={bgMode === "caption" ? "active" : ""}
                                    onClick={() => setBgMode("caption")}
                                >
                                    Caption
                                </button>
                                <button
                                    type="button"
                                    className={bgMode === "auto" ? "active" : ""}
                                    onClick={() => setBgMode("auto")}
                                >
                                    Auto
                                </button>
                                <button
                                    type="button"
                                    className={bgMode === "clip" ? "active" : ""}
                                    onClick={() => setBgMode("clip")}
                                >
                                    Clip
                                </button>
                            </div>

                            {bgMode === "clip" && (
                                <>
                                    <select
                                        className="studio-select"
                                        value={selectedClipName}
                                        onChange={(event) => setSelectedClipName(event.target.value)}
                                        disabled={clips.length === 0 && !selectedClipName}
                                        aria-label="Clip"
                                    >
                                        {clips.length === 0 && !selectedClipName ? (
                                            <option value="">No clips</option>
                                        ) : (
                                            <>
                                                {selectedClipName && !clips.some((clip) => clip.name === selectedClipName) && (
                                                    <option value={selectedClipName}>
                                                        Order: {truncateMiddle(selectedClipName)}
                                                    </option>
                                                )}
                                                {clips.map((clip) => (
                                                    <option key={clip.name} value={clip.name}>
                                                        {truncateMiddle(clip.displayName ?? clip.name)}
                                                    </option>
                                                ))}
                                            </>
                                        )}
                                    </select>

                                    {selectedOrder?.id && studioOrderClipName && (
                                        <div
                                            className="studio-clip-audio-options"
                                            role="group"
                                            aria-label="Clip audio options"
                                        >
                                            <label className="studio-check">
                                                <input
                                                    type="radio"
                                                    name="studioClipAudio"
                                                    checked={!studioUseClipAudio && !studioUseClipAudioWithNarrator}
                                                    onChange={() => {
                                                        setOrderUseClipAudio((prev) => ({
                                                            ...prev,
                                                            [selectedOrder.id]: false,
                                                        }));
                                                        setOrderUseClipAudioWithNarrator((prev) => ({
                                                            ...prev,
                                                            [selectedOrder.id]: false,
                                                        }));
                                                    }}
                                                />
                                                <span>TTS narrator only (no clip audio)</span>
                                            </label>

                                            <label className="studio-check">
                                                <input
                                                    type="radio"
                                                    name="studioClipAudio"
                                                    checked={studioUseClipAudio && !studioUseClipAudioWithNarrator}
                                                    onChange={() => {
                                                        setOrderUseClipAudio((prev) => ({
                                                            ...prev,
                                                            [selectedOrder.id]: true,
                                                        }));
                                                        setOrderUseClipAudioWithNarrator((prev) => ({
                                                            ...prev,
                                                            [selectedOrder.id]: false,
                                                        }));
                                                    }}
                                                />
                                                <span>
                                                    Use clip audio (no narrator)
                                                    {!studioTranscriptReady && (
                                                        <span className="studio-check-hint"> — transcript pending</span>
                                                    )}
                                                </span>
                                            </label>

                                            <label className="studio-check">
                                                <input
                                                    type="radio"
                                                    name="studioClipAudio"
                                                    checked={studioUseClipAudioWithNarrator}
                                                    onChange={() => {
                                                        setOrderUseClipAudio((prev) => ({
                                                            ...prev,
                                                            [selectedOrder.id]: true,
                                                        }));
                                                        setOrderUseClipAudioWithNarrator((prev) => ({
                                                            ...prev,
                                                            [selectedOrder.id]: true,
                                                        }));
                                                    }}
                                                />
                                                <span>
                                                    Use clip audio and add narrator
                                                    {!studioTranscriptReady && (
                                                        <span className="studio-check-hint"> — transcript pending</span>
                                                    )}
                                                </span>
                                            </label>
                                        </div>
                                    )}
                                </>
                            )}

                            <div className="studio-upload">
                                <input
                                    id="studio-upload-input"
                                    type="file"
                                    accept=".mp4,.mov,.mkv,.webm,.avi"
                                    multiple
                                    onChange={(event) => setSelectedFiles(event.target.files)}
                                />
                                <label htmlFor="studio-upload-input" className="studio-upload-label">
                                    Add video
                                </label>
                                <button type="button" onClick={() => void handleUpload()} disabled={isUploading}>
                                    {isUploading ? "Uploading…" : "Upload"}
                                </button>
                            </div>
                        </section>

                        <section className="studio-block">
                            <label className="studio-label">Voice</label>

                            <div className="studio-pills">
                                <button
                                    type="button"
                                    className={voiceEngine === "edge" ? "active" : ""}
                                    onClick={() => {
                                        setVoiceEngine("edge");
                                        setSelectedVoiceId((prev) => prev || edgeVoices[0]?.id || "");
                                    }}
                                >
                                    Neural
                                </button>
                                <button
                                    type="button"
                                    className={voiceEngine === "piper" ? "active" : ""}
                                    onClick={() => setVoiceEngine("piper")}
                                >
                                    Piper
                                </button>
                                <button
                                    type="button"
                                    className={voiceEngine === "pyttsx3" ? "active" : ""}
                                    onClick={() => setVoiceEngine("pyttsx3")}
                                >
                                    Windows
                                </button>
                                <button
                                    type="button"
                                    className={voiceEngine === "none" ? "active" : ""}
                                    onClick={() => setVoiceEngine("none")}
                                >
                                    None
                                </button>
                            </div>

                            {voiceEngine === "edge" ? (
                                <select
                                    className="studio-select"
                                    value={selectedVoiceId}
                                    onChange={(event) => setSelectedVoiceId(event.target.value)}
                                    aria-label="Narrator voice"
                                >
                                    {edgeVoices.length === 0 ? (
                                        <option value="">No voices</option>
                                    ) : (
                                        edgeVoices.map((voice) => (
                                            <option key={voice.id} value={voice.id}>
                                                {voice.name}
                                            </option>
                                        ))
                                    )}
                                </select>
                            ) : voiceEngine === "none" ? (
                                <p className="studio-hint">Clip audio only. No generated narrator.</p>
                            ) : (
                                <input
                                    type="text"
                                    className="studio-input"
                                    placeholder={
                                        voiceEngine === "piper"
                                            ? "Voice id (e.g. en_US-lessac-medium)"
                                            : "System voice id"
                                    }
                                    value={selectedVoiceId}
                                    onChange={(event) => setSelectedVoiceId(event.target.value)}
                                    aria-label="Voice id"
                                />
                            )}
                        </section>

                        <div className="studio-submit">
                            <button className="studio-generate-btn" type="submit" disabled={generateDisabled}>
                                {isCreating ? "Generating…" : "Generate Reel"}
                            </button>
                        </div>
                    </form>
                </div>
            </aside>

            <main className="studio-canvas">
                {selectedOrder && (() => {
                    const { frames, pricePesos } = orderFramesAndPrice(
                        selectedOrder.script,
                        orderPricing,
                        selectedOrder,
                    );

                    return (
                        <section className="studio-order-bar panel compact">
                            <div className="studio-order-bar-inner">
                                <div className="studio-order-bar-customer">
                                    <span className="studio-order-bar-customer-label">Customer</span>
                                    <div className="studio-order-bar-customer-info">
                                        <span className="studio-order-bar-customer-name">{selectedOrder.customerName || "—"}</span>
                                        <span className="muted small">{selectedOrder.customerEmail || "—"}</span>
                                        {selectedOrder.deliveryAddress?.trim() ? (
                                            <span className="muted small">Delivery: {selectedOrder.deliveryAddress.trim()}</span>
                                        ) : null}
                                        <span className="muted small">
                                            Screen size: {orderOutputSizeLabel(selectedOrder.outputSize)}
                                        </span>
                                    </div>
                                </div>

                                <div className="studio-order-bar-amount">
                                    <span className="studio-order-bar-amount-label">Amount paid</span>
                                    <span className="studio-order-bar-amount-value">
                                        {selectedOrder.paymentStatus === "confirmed" ? `₱${pricePesos}` : "—"}
                                    </span>
                                    <span className="muted small">
                                        {frames} frame{frames !== 1 ? "s" : ""}
                                    </span>
                                </div>

                                <div className="studio-order-bar-status">
                                    <span className="studio-order-bar-status-label">Status</span>
                                    <select
                                        value={selectedOrder.orderStatus ?? "pending"}
                                        onChange={(event) =>
                                            void handleSelectedOrderStatusChange(event.target.value as OrderStatus)
                                        }
                                        className="studio-order-bar-select"
                                        title="Set order status"
                                    >
                                        <option value="pending">Pending</option>
                                        <option value="accepted">Accepted</option>
                                        <option value="declined">Declined</option>
                                        <option value="processing">Processing</option>
                                        <option value="ready_for_sending">Ready for sending</option>
                                        <option value="closed">Closed</option>
                                    </select>
                                </div>

                                <div className="studio-order-bar-payment">
                                    <span className="studio-order-bar-payment-label">Payment</span>
                                    <span className="muted small">
                                        {selectedOrder.paymentStatus === "confirmed"
                                            ? orderPaymentLine(selectedOrder)
                                            : "Pending"}
                                    </span>
                                </div>

                                {selectedOrderReels.length > 0 && (
                                    <button
                                        type="button"
                                        className="ghost-btn small studio-order-bar-view-btn"
                                        onClick={() => navigate(`/orders/${selectedOrder.id}/output`)}
                                    >
                                        View output{selectedOrderReels.length > 1 ? ` (${selectedOrderReels.length})` : ""}
                                    </button>
                                )}

                                <button
                                    type="button"
                                    className="ghost-btn small studio-order-bar-clear"
                                    onClick={() => {
                                        setSelectedOrder(null);
                                        navigate("/", { replace: true });
                                    }}
                                >
                                    Clear order
                                </button>
                            </div>
                        </section>
                    );
                })()}

                <div className="studio-viewport-wrap">
                    <div className="studio-preview-size-row">
                        <label className="studio-preview-size-label">Preview:</label>
                        <select
                            className="studio-preview-size-select"
                            value={studioPreviewSize}
                            onChange={(event) => setStudioPreviewSize(event.target.value as StudioPreviewSize)}
                            aria-label="Preview size"
                        >
                            {STUDIO_PREVIEW_SIZES.map((size) => (
                                <option key={size.id} value={size.id}>
                                    {size.label}
                                </option>
                            ))}
                        </select>

                        {clipPreviewUrl && (
                            <label
                                className="studio-preview-audio-toggle"
                                title={studioPreviewMuted ? "Play clip audio" : "Mute clip audio"}
                            >
                                <input
                                    type="checkbox"
                                    checked={!studioPreviewMuted}
                                    onChange={(event) => setStudioPreviewMuted(!event.target.checked)}
                                    aria-label={studioPreviewMuted ? "Play clip audio" : "Mute clip audio"}
                                />
                                <span className="studio-preview-audio-label">
                                    {studioPreviewMuted ? "Sound off" : "Sound on"}
                                </span>
                            </label>
                        )}
                    </div>

                    <div className="studio-caption-options-row">
                        <label className="studio-preview-size-label">Caption position</label>
                        {selectedOrder ? (
                            <span className="muted small">{selectedOrder.scriptPosition ?? "bottom"}</span>
                        ) : (
                            <select
                                className="studio-preview-size-select"
                                value={studioScriptPosition}
                                onChange={(event) =>
                                    setStudioScriptPosition(event.target.value as "top" | "center" | "bottom")
                                }
                                aria-label="Caption position"
                            >
                                <option value="top">Top</option>
                                <option value="center">Center</option>
                                <option value="bottom">Bottom</option>
                            </select>
                        )}

                        {!selectedOrder && (
                            <>
                                <label className="studio-preview-size-label">Caption style</label>
                                <select
                                    className="studio-preview-size-select"
                                    value={String(studioScriptStyle.fontScale ?? 1)}
                                    onChange={(event) =>
                                        setStudioScriptStyle((prev) => ({
                                            ...prev,
                                            fontScale: Number(event.target.value),
                                        }))
                                    }
                                    aria-label="Caption font size"
                                >
                                    <option value="0.8">Small</option>
                                    <option value="1">Medium</option>
                                    <option value="1.2">Large</option>
                                </select>

                                <select
                                    className="studio-preview-size-select"
                                    value={String(studioScriptStyle.bgOpacity ?? 180)}
                                    onChange={(event) =>
                                        setStudioScriptStyle((prev) => ({
                                            ...prev,
                                            bgOpacity: Number(event.target.value),
                                        }))
                                    }
                                    aria-label="Caption background"
                                >
                                    <option value="120">Light</option>
                                    <option value="180">Medium</option>
                                    <option value="220">Dark</option>
                                </select>
                            </>
                        )}
                    </div>

                    <div className="studio-preview-monitor" data-preview-size={studioPreviewSize}>
                        <div className="studio-preview-inner">
                            {bgMode === "caption" ? (
                                <div className="render-preview-caption-bg" />
                            ) : clipPreviewUrl ? (
                                <video
                                    className="render-preview-video"
                                    src={clipPreviewUrl}
                                    muted={studioPreviewMuted}
                                    loop
                                    autoPlay
                                    playsInline
                                    onLoadedMetadata={(event) => {
                                        const videoElement = event.currentTarget;
                                        if (videoElement.videoWidth && videoElement.videoHeight) {
                                            setStudioPreviewSize(
                                                studioPreviewSizeFromDimensions(
                                                    videoElement.videoWidth,
                                                    videoElement.videoHeight,
                                                ),
                                            );
                                        }
                                    }}
                                />
                            ) : (
                                <div className="render-preview-no-clip">
                                    <span className="muted small">No clip selected</span>
                                </div>
                            )}

                            <div className="render-preview-title" style={{ fontFamily: previewFontFamily }}>
                                {title.trim() || "Your title here"}
                            </div>

                            <div className="render-preview-caption" style={previewCaptionStyle}>
                                {previewCaptionText}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="studio-timeline-wrap">
                    <div className="studio-timeline-label">
                        Frames
                        <span className="muted small">
                            {" "}
                            {studioFrameTexts.length} frame{studioFrameTexts.length !== 1 ? "s" : ""}
                        </span>
                    </div>

                    <div className="studio-timeline" role="list">
                        {studioFrameTexts.map((frameText, index) => (
                            <div
                                key={index}
                                role="listitem"
                                className={`studio-timeline-frame ${index === studioPreviewFrameIndex ? "active" : ""}`}
                                onClick={() => setStudioPreviewFrameIndex(index)}
                            >
                                <span className="studio-timeline-frame-num">{index + 1}</span>
                                <textarea
                                    className="studio-timeline-frame-input"
                                    value={frameText}
                                    onChange={(event) => {
                                        const nextFrames = [...studioFrameTexts];
                                        nextFrames[index] = event.target.value;
                                        setScript(nextFrames.join(" "));
                                    }}
                                    onClick={(event) => event.stopPropagation()}
                                    placeholder="Frame text"
                                    aria-label={`Frame ${index + 1} caption`}
                                    rows={3}
                                />
                            </div>
                        ))}

                        {studioFrameTexts.length === 0 && (
                            <div className="studio-timeline-empty muted small">
                                Add script to see frames
                            </div>
                        )}
                    </div>
                </div>

                <footer className="studio-status-bar">
                    <div className="studio-status-left">
                        <span className="studio-status-label">
                            {activeStudioJob ? (
                                <>
                                    Rendering · Job {activeStudioJob.id.slice(0, 8)}
                                    {activeStudioJob.stage ? ` · ${activeStudioJob.stage}` : ""}
                                </>
                            ) : (
                                statusMessage || "Ready to create"
                            )}
                        </span>

                        {activeStudioJob && (
                            <div className="studio-status-progress">
                                <div className="studio-status-progress-track">
                                    <div
                                        className="studio-status-progress-fill"
                                        style={{
                                            width: `${Math.max(0, Math.min(100, activeStudioJob.progress))}%`,
                                        }}
                                    />
                                </div>
                                <span className="studio-status-progress-pct" aria-hidden="true">
                                    {Math.round(Math.max(0, Math.min(100, activeStudioJob.progress)))}%
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="studio-status-right">
                        <button
                            type="button"
                            className="ghost-btn small"
                            onClick={() => navigate("/outputs")}
                        >
                            Open Outputs
                        </button>
                    </div>
                </footer>
            </main>

            <div className="job-toast-stack" aria-live="polite" aria-atomic="false">
                {jobs
                    .filter((job) => job.status !== "completed")
                    .slice(0, 4)
                    .map((job) => (
                        <article key={job.id} className={`job-toast ${job.status}`}>
                            <div className="job-toast-head">
                                <strong>{job.id.slice(0, 8)}</strong>
                                <span className={`job-chip ${job.status}`}>{job.status}</span>
                            </div>

                            {job.stage ? <div className="job-stage">{job.stage}</div> : null}

                            {job.status === "failed" ? (
                                <p className="error">{job.error || "Generation failed"}</p>
                            ) : (
                                <div className="job-progress">
                                    <div className="job-progress-track">
                                        <div
                                            className="job-progress-fill"
                                            style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }}
                                        />
                                    </div>
                                    <span className="job-progress-pct" aria-hidden="true">
                                        {Math.round(Math.max(0, Math.min(100, job.progress)))}%
                                    </span>
                                </div>
                            )}
                        </article>
                    ))}
            </div>
        </div>
    );
}

export default StudioPage;
