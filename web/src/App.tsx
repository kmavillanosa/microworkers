import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Routes,
  Route,
  NavLink,
  useNavigate,
  useSearchParams,
  useLocation,
  useParams,
} from "react-router-dom";
import "./App.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClipItem = {
  name: string;
  displayName?: string;
  filename?: string;
  size?: number;
  createdAt: string;
  url: string;
};

type VoiceItem = {
  id: string;
  name: string;
};

type FontItem = {
  id: string;
  name: string;
  filename?: string;
  source: "custom" | "builtin";
};

type PiperCatalogItem = {
  id: string;
  name: string;
  description: string;
  quality: "medium" | "high";
  installed: boolean;
};

type VoicesResponse = {
  defaultEngine: "piper" | "pyttsx3" | "edge";
  pyttsx3: VoiceItem[];
  edge: Array<{ id: string; name: string; locale: string }>;
  piper: {
    installed: Array<{ id: string; name: string; modelPath: string }>;
    catalog: PiperCatalogItem[];
  };
};

type FontsResponse = {
  defaultFont: string;
  items: FontItem[];
};

type StudioPreviewSize = "phone" | "tablet" | "laptop" | "desktop";

const STUDIO_PREVIEW_SIZES: { id: StudioPreviewSize; label: string }[] = [
  { id: "phone", label: "Phone" },
  { id: "tablet", label: "Tablet" },
  { id: "laptop", label: "Laptop" },
  { id: "desktop", label: "Desktop" },
];

function studioPreviewSizeFromDimensions(
  width: number,
  height: number,
): StudioPreviewSize {
  if (!width || !height) return "phone";
  const ratio = width / height;
  if (ratio < 0.75) return "phone";
  if (ratio < 1.1) return "tablet";
  if (ratio <= 1.85) return "laptop";
  return "desktop";
}

function orderOutputSizeLabel(size: string | null | undefined): string {
  switch (size) {
    case "tablet": return "Tablet";
    case "laptop": return "Laptop";
    case "desktop": return "Desktop";
    default: return "Phone";
  }
}

/** Format payment line for confirmed orders (bank, ref, descriptor). */
function orderPaymentLine(order: {
  bankCode: string | null;
  paymentReference: string | null;
  paymentDescriptor?: string | null;
}): string {
  const parts: string[] = [];
  if (order.bankCode) parts.push(order.bankCode);
  if (
    order.paymentReference &&
    order.paymentReference !== (order.bankCode ?? "")
  ) {
    parts.push(order.paymentReference);
  }
  if (order.paymentDescriptor?.trim()) {
    parts.push(order.paymentDescriptor.trim());
  }
  return parts.length ? `✓ ${parts.join(" · ")}` : "✓ Paid";
}

type OrderStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "processing"
  | "ready_for_sending"
  | "closed";

type Order = {
  id: string;
  customerName: string;
  customerEmail: string;
  deliveryAddress: string;
  script: string;
  title: string | null;
  fontId: string;
  clipName: string | null;
  voiceEngine: string;
  voiceName: string;
  /** Output video size: phone, tablet, laptop, desktop. */
  outputSize?: string | null;
  useClipAudio?: boolean;
  useClipAudioWithNarrator?: boolean;
  bankCode: string | null;
  paymentReference: string | null;
  /** PayMongo statement_descriptor or transaction descriptor. */
  paymentDescriptor?: string | null;
  paymentStatus: "pending" | "confirmed";
  orderStatus: OrderStatus;
  createdAt: string;
  scriptPosition?: string | null;
  scriptStyle?: { fontScale?: number; bgOpacity?: number } | null;
};

type ClipTranscriptInfo = {
  status: string | null;
  text: string | null;
  error: string | null;
  updatedAt: string | null;
  language: string | null;
  languageProbability: number | null;
};

type UploadRecord = {
  platform: "youtube" | "facebook" | "instagram";
  accountId: string;
  url: string;
  uploadedAt: string;
};

type ReelItem = {
  id: string;
  folder: string;
  createdAt: string;
  videoUrl: string;
  srtUrl: string;
  txtUrl: string;
  uploaded: boolean;
  uploadedAt?: string;
  youtubeUrl?: string;
  uploadLog: UploadRecord[];
  nicheId?: string;
  nicheLabel?: string;
  orderId?: string;
  showcase?: boolean;
  showcaseTitle?: string;
  showcaseDescription?: string;
};

type ReelJob = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  stage?: string;
  outputFolder?: string;
  error?: string;
  orderId?: string;
};

type Platform = "youtube" | "facebook" | "instagram";

type NicheItem = {
  id: string;
  label: string;
  keywords: string;
  rssFeeds: string[];
  createdAt: string;
};

type Pipeline = {
  id: string;
  label: string;
  enabled: boolean;
  nicheId: string;
  facebookAccountId: string;
  /** When set, post only to these page IDs; when null/empty, post to all pages */
  facebookPageIds?: string[] | null;
  voiceEngine: string;
  voiceName: string;
  fontName: string;
  ollamaModel: string;
  lang?: string;
  intervalHours: number;
  createdAt: string;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
  isRunning?: boolean;
};

type SocialAccount = {
  id: string;
  platform: Platform;
  label: string;
  connected: boolean;
  createdAt: string;
};

type YoutubeStatusResponse = {
  configured: boolean;
  accounts: Array<{ id: string; label: string; connected: boolean }>;
};

type FacebookStatusResponse = {
  configured: boolean;
  facebookAccounts: Array<{ id: string; label: string; connected: boolean }>;
  instagramAccounts: Array<{ id: string; label: string; connected: boolean }>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Local API (backoffice talks to this for orders, Generate reel, etc.). */
const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3010";

/** VPS API (customer orders, receipts, worker uploads). Set when you need to reference VPS (e.g. receipt links). */
const apiVpsBaseUrl = import.meta.env.VITE_API_VPS_BASE_URL ?? "";

const appEnv = (import.meta.env.VITE_APP_ENV ?? "local").toLowerCase();
const envLabel =
  appEnv === "production"
    ? "production"
    : appEnv === "dev"
      ? "dev"
      : "local";

function OrderOutputPage({
  orders,
  reels,
  navigate,
  apiBaseUrl: baseUrl,
  apiVpsBaseUrl: vpsBaseUrl,
  onDeleteOrder,
  orderDeletingId,
}: {
  orders: Order[];
  reels: ReelItem[];
  navigate: (path: string) => void;
  apiBaseUrl: string;
  apiVpsBaseUrl: string;
  onDeleteOrder?: (orderId: string) => Promise<void>;
  orderDeletingId?: string | null;
}) {
  const { orderId } = useParams<{ orderId: string }>();
  const order = orders.find((o) => o.id === orderId);
  const orderReels = reels.filter((r) => r.orderId === orderId);
  const mediaBase = vpsBaseUrl || baseUrl;

  if (!orderId) {
    return (
      <div className="outputs-page" style={{ padding: "var(--pad-md)" }}>
        <p className="muted">Missing order ID.</p>
        <button type="button" className="btn-secondary" onClick={() => navigate("/orders")}>
          Back to orders
        </button>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="outputs-page" style={{ padding: "var(--pad-md)" }}>
        <p className="muted">Order not found.</p>
        <button type="button" className="btn-secondary" onClick={() => navigate("/orders")}>
          Back to orders
        </button>
      </div>
    );
  }

  async function handleDeleteOrder() {
    if (!orderId || !onDeleteOrder) return;
    if (
      !window.confirm(
        "Permanently delete this order and all its generated videos? This cannot be undone.",
      )
    ) {
      return;
    }
    try {
      await onDeleteOrder(orderId);
    } catch (e) {
      console.error(e);
      window.alert("Failed to delete order. See console.");
    }
  }

  return (
    <div className="outputs-page" style={{ padding: "var(--pad-md)" }}>
      <section className="panel output-panel">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--gap-sm)", marginBottom: "var(--pad-md)", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-secondary small"
            onClick={() => navigate("/orders")}
          >
            ← Back to orders
          </button>
          {onDeleteOrder && (
            <button
              type="button"
              className="ghost-btn small"
              onClick={() => void handleDeleteOrder()}
              disabled={orderDeletingId === orderId}
              title="Delete this order and its generated videos"
            >
              {orderDeletingId === orderId ? "Deleting…" : "Delete order"}
            </button>
          )}
        </div>
        <h2>Output for order</h2>
        <p className="muted small">
          <strong>{(order as Order).customerName}</strong> · {(order as Order).customerEmail}
          {" · "}
          Order ID: {order.id.slice(0, 8)}…
        </p>
        {orderReels.length === 0 ? (
          <p className="muted small">No reels generated for this order yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "var(--pad-md)", marginTop: "var(--pad-md)" }}>
            {orderReels.map((reel) => (
              <div
                key={reel.id}
                className="panel compact"
                style={{ padding: "var(--pad-md)" }}
              >
                <p className="small muted" style={{ marginBottom: "0.5rem" }}>
                  {new Date(reel.createdAt).toLocaleString()}
                </p>
                <video
                  src={`${mediaBase}${reel.videoUrl}`}
                  controls
                  style={{
                    maxWidth: "100%",
                    maxHeight: "70vh",
                    objectFit: "contain",
                    borderRadius: "8px",
                    background: "#000",
                  }}
                />
                <p style={{ marginTop: "0.5rem" }}>
                  <a
                    href={`${mediaBase}${reel.videoUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="small"
                  >
                    Open video in new tab
                  </a>
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function truncateMiddle(value: string, max = 44): string {
  if (value.length <= max) return value;
  const keep = Math.floor((max - 1) / 2);
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

function parseFacebookPageIdFromUrl(url: string): string | undefined {
  const m = url.match(/facebook\.com\/(\d+)\/videos\//i);
  return m?.[1];
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// PipelineForm — reusable form for creating/editing a pipeline
// ---------------------------------------------------------------------------

function PipelineForm({
  pipeline,
  niches,
  facebookAccounts,
  edgeVoices,
  fonts,
  isRunning,
  onSave,
  onCancel,
}: {
  pipeline: Pipeline | null;
  niches: NicheItem[];
  facebookAccounts: SocialAccount[];
  edgeVoices: VoiceItem[];
  fonts: FontItem[];
  isRunning: boolean;
  onSave: (data: Partial<Pipeline> & { label: string }) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(pipeline?.label ?? "New Pipeline");
  const [enabled, setEnabled] = useState(pipeline?.enabled ?? false);
  const [nicheId, setNicheId] = useState(
    pipeline?.nicheId ?? niches[0]?.id ?? "",
  );
  const [facebookAccountId, setFacebookAccountId] = useState(
    pipeline?.facebookAccountId ?? "",
  );
  const [voiceEngine, setVoiceEngine] = useState(
    pipeline?.voiceEngine ?? "edge",
  );
  const [voiceName, setVoiceName] = useState(
    pipeline?.voiceName ?? "en-US-GuyNeural",
  );
  const [fontName, setFontName] = useState(
    pipeline?.fontName ?? "Kidmania Trial Regular.otf",
  );
  const [ollamaModel, setOllamaModel] = useState(
    pipeline?.ollamaModel ?? "llama3",
  );
  const [lang, setLang] = useState<"auto" | "english" | "tagalog" | "taglish">(
    (pipeline?.lang as "auto" | "english" | "tagalog" | "taglish") ?? "auto",
  );
  const [intervalHours, setIntervalHours] = useState(
    pipeline?.intervalHours ?? 0.5,
  );
  const [facebookPageIds, setFacebookPageIds] = useState<string[]>(
    pipeline?.facebookPageIds ?? [],
  );
  const [availablePages, setAvailablePages] = useState<
    Array<{ id: string; name: string }>
  >([]);

  const connectedFbAccounts = facebookAccounts.filter((a) => a.connected);

  useEffect(() => {
    if (!facebookAccountId) {
      setAvailablePages([]);
      return;
    }
    let cancelled = false;
    fetch(
      `${apiBaseUrl}/api/facebook/pages?accountId=${encodeURIComponent(facebookAccountId)}`,
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((pages: Array<{ id: string; name: string }>) => {
        if (!cancelled) setAvailablePages(pages);
      })
      .catch(() => {
        if (!cancelled) setAvailablePages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [facebookAccountId]);

  useEffect(() => {
    setFacebookPageIds(pipeline?.facebookPageIds ?? []);
  }, [pipeline?.id, pipeline?.facebookPageIds]);

  function togglePage(pageId: string) {
    setFacebookPageIds((prev) =>
      prev.includes(pageId)
        ? prev.filter((id) => id !== pageId)
        : [...prev, pageId],
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSave({
      label,
      enabled,
      nicheId,
      facebookAccountId,
      facebookPageIds: facebookPageIds.length > 0 ? facebookPageIds : undefined,
      voiceEngine,
      voiceName,
      fontName,
      ollamaModel,
      lang,
      intervalHours,
    });
  }

  return (
    <div className="pipeline-form-card">
      <form onSubmit={handleSubmit}>
        <div className="youtube-upload-form">
          <label>
            Pipeline name
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </label>

          <label>
            Niche
            <select
              value={nicheId}
              onChange={(e) => setNicheId(e.target.value)}
            >
              {niches.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Facebook Page account
            <select
              value={facebookAccountId}
              onChange={(e) => setFacebookAccountId(e.target.value)}
            >
              <option value="">— select account —</option>
              {connectedFbAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>

          {facebookAccountId && availablePages.length > 0 && (
            <div className="pipeline-post-to-pages">
              <div style={{ marginBottom: "0.25rem" }}>Post to pages</div>
              <p
                className="muted small"
                style={{ margin: "0 0 0.5rem 0", fontSize: "0.8rem" }}
              >
                Leave all unchecked to post to every page this account manages.
              </p>
              <div
                className="pipeline-page-ids"
                style={{
                  maxHeight: "160px",
                  overflowY: "auto",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid var(--border, #d4d4d4)",
                  borderRadius: "6px",
                  background: "var(--panel-bg, #fff)",
                  gap: "0.35rem",
                }}
              >
                {availablePages.map((page) => (
                  <label key={page.id} className="pipeline-page-row">
                    <input
                      type="checkbox"
                      checked={facebookPageIds.includes(page.id)}
                      onChange={() => togglePage(page.id)}
                    />
                    <span className="pipeline-page-name">{page.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <label>
            Run every
            <select
              value={intervalHours}
              onChange={(e) => setIntervalHours(Number(e.target.value))}
            >
              <option value={0.5}>30 minutes</option>
              <option value={1}>1 hour</option>
              <option value={2}>2 hours</option>
              <option value={3}>3 hours</option>
              <option value={6}>6 hours</option>
              <option value={12}>12 hours</option>
              <option value={24}>24 hours</option>
            </select>
          </label>

          <label>
            Default voice engine (for reels)
            <select
              value={voiceEngine}
              onChange={(e) => setVoiceEngine(e.target.value)}
            >
              <option value="edge">Edge TTS (online)</option>
              <option value="piper">Piper (offline)</option>
              <option value="pyttsx3">pyttsx3 (system)</option>
            </select>
          </label>

          <label>
            Default neural voice (for reels)
            {voiceEngine === "edge" ? (
              <select
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
              >
                {edgeVoices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                placeholder="e.g. en_US-lessac-medium"
              />
            )}
          </label>

          <label>
            Default font (for reels)
            <select
              value={fontName}
              onChange={(e) => setFontName(e.target.value)}
            >
              {fonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Ollama model
            <input
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              placeholder="llama3"
            />
          </label>

          <label>
            Script &amp; caption language
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as typeof lang)}
            >
              <option value="auto">🌐 Auto (detect from niche)</option>
              <option value="english">🇺🇸 English</option>
              <option value="taglish">🇵🇭 Taglish</option>
              <option value="tagalog">🇵🇭 Tagalog</option>
            </select>
          </label>

          <label
            className="pipeline-toggle-label"
            style={{
              flexDirection: "row",
              gap: "0.5rem",
              alignItems: "center",
            }}
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Enable (auto-run on schedule)</span>
          </label>

          {!facebookAccountId && (
            <div className="pipeline-warning">
              ⚠️ No Facebook account selected. Connect one in Social Accounts
              first.
            </div>
          )}

          <div className="youtube-actions">
            <button type="button" className="ghost-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" disabled={isRunning}>
              {pipeline ? "Save changes" : "Create pipeline"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
  const fallbackPreviewFontFamily = '"Segoe UI", Arial, sans-serif';

  const navigate = useNavigate();
  const [settingsTab, setSettingsTab] = useState<
    "accounts" | "niches" | "pipelines" | "fonts" | "clips" | "payment" | "pricing" | "voices" | "danger"
  >("accounts");
  type SettingsVoice = { id: string; name: string; locale: string; country: string; language: string; gender: string; enabled: boolean };
  const [settingsVoices, setSettingsVoices] = useState<SettingsVoice[]>([]);
  const [settingsVoicesTogglingId, setSettingsVoicesTogglingId] = useState<string | null>(null);
  const [paymentMethodOptions, setPaymentMethodOptions] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [paymentMethodsEnabled, setPaymentMethodsEnabled] = useState<string[]>(
    [],
  );
  const [paymentMethodsSaving, setPaymentMethodsSaving] = useState(false);
  const [paymentMethodsMessage, setPaymentMethodsMessage] = useState("");

  // Studio state
  const [script, setScript] = useState("");
  const [title, setTitle] = useState("");
  const [bgMode, setBgMode] = useState<"clip" | "auto" | "caption">("auto");
  const [selectedClipName, setSelectedClipName] = useState("");
  const [voiceEngine, setVoiceEngine] = useState<"piper" | "pyttsx3" | "edge">(
    "edge",
  );
  const [pyttsx3Voices, setPyttsx3Voices] = useState<VoiceItem[]>([]);
  const [edgeVoices, setEdgeVoices] = useState<
    Array<{ id: string; name: string; locale: string }>
  >([]);
  const [piperCatalog, setPiperCatalog] = useState<PiperCatalogItem[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [fonts, setFonts] = useState<FontItem[]>([]);
  const [selectedFontName, setSelectedFontName] = useState(
    "Kidmania Trial Regular.otf",
  );
  const [fontFamilyById, setFontFamilyById] = useState<Record<string, string>>(
    {},
  );
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [jobs, setJobs] = useState<ReelJob[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
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

  // Social accounts (from DB)
  const [allAccounts, setAllAccounts] = useState<SocialAccount[]>([]);
  const [youtubeConfigured, setYoutubeConfigured] = useState(false);
  const [facebookConfigured, setFacebookConfigured] = useState(false);

  // YouTube upload state
  const [youtubeAccountId, setYoutubeAccountId] = useState("");
  const [youtubeUploading, setYoutubeUploading] = useState(false);
  const [youtubeMessage, setYoutubeMessage] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeDescription, setYoutubeDescription] = useState("shorts");
  const [youtubeTagsInput, setYoutubeTagsInput] = useState(
    "shorts, youtubeshorts, gaming, viral, fyp",
  );

  // Facebook upload state
  const [facebookAccountId, setFacebookAccountId] = useState("");
  const [facebookUploading, setFacebookUploading] = useState(false);
  const [facebookSharing, setFacebookSharing] = useState(false);
  const [facebookMessage, setFacebookMessage] = useState("");
  const [facebookCaption, setFacebookCaption] = useState(
    "reels shorts viral fyp trending",
  );
  const [facebookLastPostUrl, setFacebookLastPostUrl] = useState("");

  // Instagram upload state
  const [instagramAccountId, setInstagramAccountId] = useState("");
  const [instagramUploading, setInstagramUploading] = useState(false);
  const [instagramMessage, setInstagramMessage] = useState("");
  const [instagramCaption, setInstagramCaption] = useState(
    "reels shorts viral fyp trending",
  );

  // Per-reel card upload state
  const [reelCardUploading, setReelCardUploading] = useState<
    Record<string, string>
  >({}); // reelId -> platform
  const [reelCardMessage, setReelCardMessage] = useState<
    Record<string, string>
  >({}); // reelId -> message

  // Showcase (star for web-orders) modal
  const [showcaseReel, setShowcaseReel] = useState<ReelItem | null>(null);
  const [showcaseTitleInput, setShowcaseTitleInput] = useState("");
  const [showcaseDescInput, setShowcaseDescInput] = useState("");
  const [showcaseSaving, setShowcaseSaving] = useState(false);
  const [showcaseMessage, setShowcaseMessage] = useState("");

  // Caption / script suggestion state
  const [captionNiche, setCaptionNiche] = useState("gaming");
  const [scriptNicheInput, setScriptNicheInput] = useState("");
  const [captionLang, setCaptionLang] = useState<
    "auto" | "english" | "tagalog" | "taglish"
  >("auto");
  const [captionSuggesting, setCaptionSuggesting] = useState(false);
  const [captionSuggestTarget, setCaptionSuggestTarget] = useState<
    "facebook" | "instagram" | null
  >(null);
  const [negativeCaptionSuggesting, setNegativeCaptionSuggesting] =
    useState(false);
  const [negativeCaptionSuggestTarget, setNegativeCaptionSuggestTarget] =
    useState<"facebook" | "instagram" | null>(null);
  const [scriptGenerating, setScriptGenerating] = useState(false);
  const [negativeScriptGenerating, setNegativeScriptGenerating] =
    useState(false);

  // Settings — add account form
  const [newAccountPlatform, setNewAccountPlatform] =
    useState<Platform>("youtube");
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [fontMessage, setFontMessage] = useState("");
  const [editingFontId, setEditingFontId] = useState<string | null>(null);
  const [editingFontName, setEditingFontName] = useState("");
  const [fontUploadFile, setFontUploadFile] = useState<File | null>(null);
  const [gameClips, setGameClips] = useState<ClipItem[]>([]);
  const [orderClips, setOrderClips] = useState<ClipItem[]>([]);
  const [clipMessage, setClipMessage] = useState("");
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [editingClipName, setEditingClipName] = useState("");
  const [editingClipType, setEditingClipType] = useState<"game" | "order">("game");
  const [gameClipUploadFile, setGameClipUploadFile] = useState<File | null>(null);
  const [orderClipUploadFile, setOrderClipUploadFile] = useState<File | null>(null);

  // Niches state
  const [niches, setNiches] = useState<NicheItem[]>([]);
  const [newNicheLabel, setNewNicheLabel] = useState("");
  const [newNicheKeywords, setNewNicheKeywords] = useState("");
  const [newNicheFeeds, setNewNicheFeeds] = useState("");
  const [nicheMessage, setNicheMessage] = useState("");
  const [postingNicheId, setPostingNicheId] = useState<string | null>(null);
  const [postingReelNicheId, setPostingReelNicheId] = useState<string | null>(
    null,
  );
  const [editingNicheId, setEditingNicheId] = useState<string | null>(null);
  const [editNicheLabel, setEditNicheLabel] = useState("");
  const [editNicheKeywords, setEditNicheKeywords] = useState("");
  const [editNicheFeeds, setEditNicheFeeds] = useState("");

  // Multi-pipeline state
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineRunningIds, setPipelineRunningIds] = useState<Set<string>>(
    new Set(),
  );
  const [editingPipeline, setEditingPipeline] = useState<Pipeline | null>(null);
  const [showNewPipelineForm, setShowNewPipelineForm] = useState(false);
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderPricing, setOrderPricing] = useState<{
    wordsPerFrame: number;
    pricePerFramePesos: number;
    pricePerFramePesosByTier?: {
      ttsOnly: number;
      clipOnly: number;
      clipAndNarrator: number;
    };
  } | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderClipTranscripts, setOrderClipTranscripts] = useState<
    Record<string, ClipTranscriptInfo>
  >({});
  const [orderUseClipAudio, setOrderUseClipAudio] = useState<
    Record<string, boolean>
  >({});
  const [orderUseClipAudioWithNarrator, setOrderUseClipAudioWithNarrator] =
    useState<Record<string, boolean>>({});
  const [ordersFilterStatus, setOrdersFilterStatus] = useState<string>("");
  const [ordersFilterPayment, setOrdersFilterPayment] = useState<string>("");
  const [ordersFilterReference, setOrdersFilterReference] = useState("");
  const [ordersFilterBank, setOrdersFilterBank] = useState<string>("");
  const thisYear = new Date().getFullYear();
  const [ordersFilterDateStart, setOrdersFilterDateStart] = useState<string>(
    () => `${thisYear}-01-01`,
  );
  const [ordersFilterDateEnd, setOrdersFilterDateEnd] = useState<string>(
    () => `${thisYear}-12-31`,
  );
  const [deleteAllOrdersInProgress, setDeleteAllOrdersInProgress] =
    useState(false);
  const [orderDeletingId, setOrderDeletingId] = useState<string | null>(null);
  const [orderPricingEdit, setOrderPricingEdit] = useState<{
    wordsPerFrame: string;
    pricePerFramePesos: string;
    clipOnly: string;
    clipAndNarrator: string;
  }>({ wordsPerFrame: "5", pricePerFramePesos: "3", clipOnly: "5", clipAndNarrator: "7" });
  const [orderPricingSaving, setOrderPricingSaving] = useState(false);
  const [processingOrders, setProcessingOrders] = useState<
    Record<string, boolean>
  >({});
  const [kanbanDragOrderId, setKanbanDragOrderId] = useState<string | null>(null);
  const [kanbanDropTarget, setKanbanDropTarget] = useState<OrderStatus | null>(null);

  // Derived account lists
  const youtubeAccounts = useMemo(
    () => allAccounts.filter((a) => a.platform === "youtube"),
    [allAccounts],
  );
  const facebookAccounts = useMemo(
    () => allAccounts.filter((a) => a.platform === "facebook"),
    [allAccounts],
  );
  const instagramAccounts = useMemo(
    () => allAccounts.filter((a) => a.platform === "instagram"),
    [allAccounts],
  );
  const connectedYoutubeAccounts = useMemo(
    () => youtubeAccounts.filter((a) => a.connected),
    [youtubeAccounts],
  );
  const connectedFacebookAccounts = useMemo(
    () => facebookAccounts.filter((a) => a.connected),
    [facebookAccounts],
  );
  const connectedInstagramAccounts = useMemo(
    () => instagramAccounts.filter((a) => a.connected),
    [instagramAccounts],
  );

  const activeJobs = useMemo(
    () =>
      jobs.filter(
        (job) => job.status === "queued" || job.status === "processing",
      ),
    [jobs],
  );

  /** Orders within the selected date range (for filtering and breakdown). */
  const ordersInDateRange = useMemo(() => {
    if (!ordersFilterDateStart || !ordersFilterDateEnd) return orders;
    return orders.filter((o) => {
      const d = o.createdAt.slice(0, 10);
      return d >= ordersFilterDateStart && d <= ordersFilterDateEnd;
    });
  }, [orders, ordersFilterDateStart, ordersFilterDateEnd]);

  const filteredOrders = useMemo(() => {
    let list = ordersInDateRange;
    if (ordersFilterStatus) {
      list = list.filter(
        (o) => (o as Order).orderStatus === ordersFilterStatus,
      );
    }
    if (ordersFilterPayment) {
      list = list.filter((o) => o.paymentStatus === ordersFilterPayment);
    }
    if (ordersFilterReference.trim()) {
      const q = ordersFilterReference.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          (o.paymentReference ?? "").toLowerCase().includes(q) ||
          (o.paymentDescriptor ?? "").toLowerCase().includes(q),
      );
    }
    if (ordersFilterBank) {
      list = list.filter((o) => (o.bankCode ?? "") === ordersFilterBank);
    }
    return list;
  }, [
    ordersInDateRange,
    ordersFilterStatus,
    ordersFilterPayment,
    ordersFilterReference,
    ordersFilterBank,
  ]);

  /** Kanban columns: status id → label and order. */
  const KANBAN_COLUMNS: Array<{ id: OrderStatus; label: string }> = [
    { id: "pending", label: "Pending" },
    { id: "accepted", label: "Accepted" },
    { id: "processing", label: "Processing" },
    { id: "ready_for_sending", label: "Ready for sending" },
    { id: "closed", label: "Closed" },
    { id: "declined", label: "Declined" },
  ];

  /** Orders grouped by status for kanban columns (uses filteredOrders). */
  const ordersByStatus = useMemo(() => {
    const map: Record<OrderStatus, Order[]> = {
      pending: [],
      accepted: [],
      processing: [],
      ready_for_sending: [],
      closed: [],
      declined: [],
    };
    for (const o of filteredOrders) {
      const status = (o as Order).orderStatus ?? "pending";
      if (status in map && Array.isArray(map[status as OrderStatus])) {
        map[status as OrderStatus].push(o as Order);
      } else {
        map.pending.push(o as Order);
      }
    }
    return map;
  }, [filteredOrders]);

  /** Breakdown: pending, ongoing (accepted+processing), completed (closed), rejected (declined). */
  const ordersBreakdown = useMemo(() => {
    const wpf = orderPricing?.wordsPerFrame ?? 5;
    const tiers = orderPricing?.pricePerFramePesosByTier;
    const defaultPfp = orderPricing?.pricePerFramePesos ?? 5;
    function priceFor(o: Order): number {
      const pfp = tiers
        ? (o.useClipAudioWithNarrator ? tiers.clipAndNarrator : o.useClipAudio ? tiers.clipOnly : tiers.ttsOnly)
        : defaultPfp;
      const words = o.script.trim().split(/\s+/).filter(Boolean);
      const frames = wpf < 1 ? 0 : Math.ceil(words.length / wpf) || 0;
      return frames * pfp;
    }
    const buckets = {
      pending: { count: 0, amount: 0 },
      ongoing: { count: 0, amount: 0 },
      readyForSending: { count: 0, amount: 0 },
      completed: { count: 0, amount: 0 },
      rejected: { count: 0, amount: 0 },
    };
    for (const o of ordersInDateRange) {
      const order = o as Order;
      const status = order.orderStatus ?? "pending";
      const amount = priceFor(order);
      if (status === "pending") {
        buckets.pending.count += 1;
        buckets.pending.amount += amount;
      } else if (status === "accepted" || status === "processing") {
        buckets.ongoing.count += 1;
        buckets.ongoing.amount += amount;
      } else if (status === "ready_for_sending") {
        buckets.readyForSending.count += 1;
        buckets.readyForSending.amount += amount;
      } else if (status === "closed") {
        buckets.completed.count += 1;
        buckets.completed.amount += amount;
      } else {
        buckets.rejected.count += 1;
        buckets.rejected.amount += amount;
      }
    }
    const total = {
      count:
        buckets.pending.count +
        buckets.ongoing.count +
        buckets.readyForSending.count +
        buckets.completed.count +
        buckets.rejected.count,
      amount:
        buckets.pending.amount +
        buckets.ongoing.amount +
        buckets.readyForSending.amount +
        buckets.completed.amount +
        buckets.rejected.amount,
    };
    return { ...buckets, total };
  }, [ordersInDateRange, orderPricing?.wordsPerFrame, orderPricing?.pricePerFramePesos, orderPricing?.pricePerFramePesosByTier]);

  const pendingOrdersCount = useMemo(
    () => orders.filter((o) => (o as Order).orderStatus === "pending").length,
    [orders],
  );

  const [searchParams] = useSearchParams();
  const location = useLocation();

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  async function handleDeleteAllOrdersAndRelated() {
    if (
      !window.confirm(
        "Permanently delete ALL orders, all order-generated videos, and all customer-uploaded order clips? This cannot be undone.",
      )
    ) {
      return;
    }
    setDeleteAllOrdersInProgress(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/orders/delete-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE_ALL_ORDERS" }),
      });
      if (!res.ok) throw new Error("Delete failed");
      await Promise.all([loadOrders(), loadReels()]);
      setSelectedOrder(null);
    } catch (e) {
      console.error(e);
      window.alert("Failed to delete. See console.");
    } finally {
      setDeleteAllOrdersInProgress(false);
    }
  }

  async function handleDeleteOrder(orderId: string) {
    if (
      !window.confirm(
        "Permanently delete this order and all its generated videos? This cannot be undone.",
      )
    ) {
      return;
    }
    setOrderDeletingId(orderId);
    try {
      const res = await fetch(`${apiBaseUrl}/api/orders/${encodeURIComponent(orderId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      await Promise.all([loadOrders(), loadReels()]);
      setSelectedOrder((prev) => (prev?.id === orderId ? null : prev));
    } catch (e) {
      console.error(e);
      window.alert("Failed to delete order. See console.");
    } finally {
      setOrderDeletingId(null);
    }
  }

  async function loadOrders() {
    try {
      const [ordersRes, pricingRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/orders`),
        fetch(`${apiBaseUrl}/api/orders/pricing`),
      ]);
      if (ordersRes.ok) {
        const data = (await ordersRes.json()) as Order[];
        setOrders(data);
        const clipNames = data
          .map((o) => o.clipName)
          .filter((name): name is string => Boolean(name));
        if (clipNames.length > 0) {
          void loadOrderClipTranscripts(clipNames);
        }
      }
      if (pricingRes.ok) {
        const p = (await pricingRes.json()) as {
          wordsPerFrame: number;
          pricePerFramePesos: number;
          pricePerFramePesosByTier?: {
            ttsOnly: number;
            clipOnly: number;
            clipAndNarrator: number;
          };
        };
        if (typeof p.wordsPerFrame === "number") {
          const pricePerFramePesos =
            typeof p.pricePerFramePesos === "number"
              ? p.pricePerFramePesos
              : p.pricePerFramePesosByTier?.ttsOnly ?? 5;
          setOrderPricing({
            wordsPerFrame: p.wordsPerFrame,
            pricePerFramePesos,
            pricePerFramePesosByTier: p.pricePerFramePesosByTier ?? {
              ttsOnly: pricePerFramePesos,
              clipOnly: 3,
              clipAndNarrator: 4,
            },
          });
        }
      }
    } catch {
      // non-fatal
    }
  }

  async function loadOrderClipTranscripts(clipNames: string[]) {
    const unique = Array.from(new Set(clipNames));
    if (unique.length === 0) return;
    try {
      const results = await Promise.all(
        unique.map(async (clipName) => {
          const res = await fetch(
            `${apiBaseUrl}/api/order-clips/${encodeURIComponent(clipName)}/transcript`,
          );
          if (!res.ok) return [clipName, null] as const;
          const data = (await res.json()) as ClipTranscriptInfo;
          return [clipName, data] as const;
        }),
      );
      setOrderClipTranscripts((prev) => {
        const next = { ...prev };
        results.forEach(([clipName, data]) => {
          if (data) next[clipName] = data;
        });
        return next;
      });
    } catch {
      // non-fatal
    }
  }

  /** Price per frame for an order's tier (TTS only, clip only, or clip + narrator). */
  function pricePerFrameForOrder(order: Order): number {
    const tiers = orderPricing?.pricePerFramePesosByTier;
    if (!tiers) return orderPricing?.pricePerFramePesos ?? 5;
    if (order.useClipAudioWithNarrator) return tiers.clipAndNarrator;
    if (order.useClipAudio) return tiers.clipOnly;
    return tiers.ttsOnly;
  }

  /** Compute frame count and total price for a script using current order pricing; optional order for tier. */
  function orderFramesAndPrice(script: string, order?: Order): { frames: number; pricePesos: number } {
    const wpf = orderPricing?.wordsPerFrame ?? 5;
    const pfp = order ? pricePerFrameForOrder(order) : (orderPricing?.pricePerFramePesos ?? 5);
    const words = script.trim().split(/\s+/).filter(Boolean);
    const frames = wpf < 1 ? 0 : Math.ceil(words.length / wpf) || 0;
    return { frames, pricePesos: frames * pfp };
  }

  /** Split script into frame caption texts for timeline (uses order pricing words-per-frame). */
  function scriptToFrameTexts(scriptText: string): string[] {
    const wpf = orderPricing?.wordsPerFrame ?? 5;
    const words = scriptText.trim().split(/\s+/).filter(Boolean);
    if (wpf < 1) return [];
    const frames: string[] = [];
    for (let i = 0; i < words.length; i += wpf) {
      frames.push(words.slice(i, i + wpf).join(" "));
    }
    return frames;
  }

  const studioFrameTexts = useMemo(
    () => scriptToFrameTexts(script),
    [script, orderPricing?.wordsPerFrame],
  );

  useEffect(() => {
    const n = studioFrameTexts.length;
    setStudioPreviewFrameIndex((prev) => {
      if (n === 0) return 0;
      return prev >= n ? n - 1 : prev;
    });
  }, [studioFrameTexts.length]);

  useEffect(() => {
    if (orderPricing == null) return;
    const tiers = orderPricing.pricePerFramePesosByTier;
    setOrderPricingEdit({
      wordsPerFrame: String(orderPricing.wordsPerFrame),
      pricePerFramePesos: String(orderPricing.pricePerFramePesos),
      clipOnly: tiers ? String(tiers.clipOnly) : "5",
      clipAndNarrator: tiers ? String(tiers.clipAndNarrator) : "7",
    });
  }, [orderPricing?.wordsPerFrame, orderPricing?.pricePerFramePesos, orderPricing?.pricePerFramePesosByTier]);

  async function handleSaveOrderPricing() {
    const wpf = parseInt(orderPricingEdit.wordsPerFrame, 10);
    const pfp = parseFloat(orderPricingEdit.pricePerFramePesos);
    const clipOnly = parseFloat(orderPricingEdit.clipOnly);
    const clipAndNarrator = parseFloat(orderPricingEdit.clipAndNarrator);
    if (Number.isNaN(wpf) || wpf < 1 || wpf > 100) return;
    if (Number.isNaN(pfp) || pfp < 0) return;
    if (Number.isNaN(clipOnly) || clipOnly < 0) return;
    if (Number.isNaN(clipAndNarrator) || clipAndNarrator < 0) return;
    setOrderPricingSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/orders/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wordsPerFrame: wpf,
          pricePerFramePesos: pfp,
          clipOnly,
          clipAndNarrator,
        }),
      });
      if (res.ok) {
        const p = (await res.json()) as {
          wordsPerFrame: number;
          pricePerFramePesos: number;
          pricePerFramePesosByTier?: { ttsOnly: number; clipOnly: number; clipAndNarrator: number };
        };
        setOrderPricing(p);
      }
    } finally {
      setOrderPricingSaving(false);
    }
  }

  async function handleToggleOrderProcessing(order: Order) {
    const isProcessing = processingOrders[order.id] === true;
    const useClipAudio =
      orderUseClipAudio[order.id] ?? order.useClipAudio ?? false;
    const useClipAudioWithNarrator =
      orderUseClipAudioWithNarrator[order.id] ?? order.useClipAudioWithNarrator ?? false;
    if (!isProcessing) {
      setProcessingOrders((prev) => ({ ...prev, [order.id]: true }));
      try {
        const res = await fetch(
          `${apiBaseUrl}/api/orders/${order.id}/process`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              useClipAudio,
              useClipAudioWithNarrator: useClipAudioWithNarrator || undefined,
            }),
          },
        );
        if (!res.ok) throw new Error("Failed to queue processing job");
        const created = (await res.json()) as {
          jobId: string;
          status: ReelJob["status"];
          progress: number;
          createdAt: string;
        };
        setJobs((previous) => [
          {
            id: created.jobId,
            status: created.status,
            progress: created.progress,
          },
          ...previous,
        ]);
        await handleSetOrderStatus(order.id, "processing");
      } catch {
        setProcessingOrders((prev) => {
          const next = { ...prev };
          delete next[order.id];
          return next;
        });
      }
    } else {
      setProcessingOrders((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
    }
  }

  async function handleSetOrderStatus(
    orderId: string,
    orderStatus: OrderStatus,
  ) {
    try {
      const res = await fetch(`${apiBaseUrl}/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      await loadOrders();
      setSelectedOrder((prev) =>
        prev?.id === orderId ? { ...prev, orderStatus } : prev,
      );
    } catch {
      // non-fatal
    }
  }

  async function loadActiveJobs() {
    try {
      const res = await fetch(`${apiBaseUrl}/api/reels/jobs`);
      if (!res.ok) return;
      const data = (await res.json()) as ReelJob[];
      setJobs(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void Promise.all([
      loadClips(),
      loadReels(),
      loadVoices(),
      loadFonts(),
      loadAllAccounts(),
      loadYoutubeStatus(),
      loadFacebookStatus(),
      loadNiches(),
      loadPipelines(),
      loadOrders(),
      loadActiveJobs(),
    ]);
    // Request notification permission early so the browser prompt appears on load
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  // Prefill Studio from order when opening from Orders dashboard
  const orderIdFromUrl = searchParams.get("orderId");
  useEffect(() => {
    if (location.pathname !== "/" || !orderIdFromUrl) {
      if (!orderIdFromUrl) setSelectedOrder(null);
      return;
    }
    fetch(`${apiBaseUrl}/api/orders/${orderIdFromUrl}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((order: Order | null) => {
        if (!order) return;
        setSelectedOrder(order);
        setScript(order.script);
        setTitle(order.title ?? "");
        setSelectedClipName(order.clipName ?? "");
        if (order.clipName) {
          setBgMode("clip");
        }
        setSelectedFontName(order.fontId);
        setVoiceEngine(order.voiceEngine as "piper" | "pyttsx3" | "edge");
        setSelectedVoiceId(order.voiceName);
        setOrderUseClipAudio((prev) => ({
          ...prev,
          [order.id]: order.useClipAudio ?? false,
        }));
        setOrderUseClipAudioWithNarrator((prev) => ({
          ...prev,
          [order.id]: order.useClipAudioWithNarrator ?? false,
        }));
      })
      .catch(() => setSelectedOrder(null));
  }, [location.pathname, orderIdFromUrl]);

  // Poll orders when viewing the orders section so new orders appear without refresh
  const isOnOrdersSection =
    location.pathname === "/orders" || location.pathname.startsWith("/orders/");
  useEffect(() => {
    if (!isOnOrdersSection) return;
    const poll = () => void loadOrders();
    const interval = window.setInterval(poll, 20000);
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isOnOrdersSection]);

  // Handle OAuth redirect callbacks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedParam = params.get("connected");
    if (connectedParam) {
      // Format: "youtube:accountId" or "facebook:accountId"
      const [platform] = connectedParam.split(":");
      if (platform === "youtube") {
        setYoutubeMessage("YouTube account connected successfully.");
        void loadYoutubeStatus();
        void loadAllAccounts();
      } else if (platform === "facebook") {
        setFacebookMessage(
          "Facebook/Instagram account connected successfully.",
        );
        void loadFacebookStatus();
        void loadAllAccounts();
      }
      params.delete("connected");
      const query = params.toString();
      const nextUrl = query
        ? `${window.location.pathname}?${query}`
        : window.location.pathname;
      window.history.replaceState({}, "", nextUrl);
    }
  }, []);

  useEffect(() => {
    const currentLatestReel = reels[0];
    if (!currentLatestReel) return;
    if (!youtubeTitle.trim()) {
      setYoutubeTitle(`Short ${currentLatestReel.folder}`);
    }
  }, [reels, youtubeTitle]);

  // Poll job status in real time when there are active jobs; refresh immediately when tab becomes visible so completion is detected and notification can fire
  useEffect(() => {
    if (!activeJobs.length) return;
    const poll = () => void refreshActiveJobs();
    poll();
    const interval = window.setInterval(poll, 1500);
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activeJobs.length]);

  // Auto-select first connected account when lists change
  useEffect(() => {
    if (!youtubeAccountId && connectedYoutubeAccounts.length > 0) {
      setYoutubeAccountId(connectedYoutubeAccounts[0].id);
    }
  }, [connectedYoutubeAccounts, youtubeAccountId]);

  useEffect(() => {
    if (!facebookAccountId && connectedFacebookAccounts.length > 0) {
      setFacebookAccountId(connectedFacebookAccounts[0].id);
    }
  }, [connectedFacebookAccounts, facebookAccountId]);

  useEffect(() => {
    if (!instagramAccountId && connectedInstagramAccounts.length > 0) {
      setInstagramAccountId(connectedInstagramAccounts[0].id);
    }
  }, [connectedInstagramAccounts, instagramAccountId]);

  // Poll pipeline statuses every 8s when any are running
  useEffect(() => {
    if (pipelineRunningIds.size === 0) return;
    const interval = window.setInterval(() => {
      void loadPipelines();
    }, 8000);
    return () => window.clearInterval(interval);
  }, [pipelineRunningIds]);

  useEffect(() => {
    if (settingsTab === "clips") {
      void loadGameClips();
      void loadOrderClips();
    }
  }, [settingsTab]);

  useEffect(() => {
    if (settingsTab === "payment") {
      setPaymentMethodsMessage("");
      fetch(`${apiBaseUrl}/api/settings/payment-methods`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { options?: Array<{ id: string; label: string }>; enabled?: string[] } | null) => {
          if (data?.options) setPaymentMethodOptions(data.options);
          if (Array.isArray(data?.enabled)) setPaymentMethodsEnabled(data.enabled);
        })
        .catch(() => setPaymentMethodsMessage("Failed to load payment methods."));
    }
  }, [settingsTab, apiBaseUrl]);

  useEffect(() => {
    if (settingsTab === "voices") {
      fetch(`${apiBaseUrl}/api/settings/voices`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data: SettingsVoice[]) => setSettingsVoices(Array.isArray(data) ? data : []))
        .catch(() => setSettingsVoices([]));
    }
  }, [settingsTab, apiBaseUrl]);

  async function handleToggleVoiceEnabled(voiceId: string, enabled: boolean) {
    setSettingsVoicesTogglingId(voiceId);
    try {
      const res = await fetch(`${apiBaseUrl}/api/settings/voices/${encodeURIComponent(voiceId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        setSettingsVoices((prev) =>
          prev.map((v) => (v.id === voiceId ? { ...v, enabled } : v))
        );
      }
    } finally {
      setSettingsVoicesTogglingId(null);
    }
  }

  function localeToFlag(locale: string): string {
    const part = locale.split("-").pop() || "";
    const cc = part.toUpperCase();
    if (cc.length !== 2) return "";
    return String.fromCodePoint(
      ...[...cc].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0))
    );
  }

  useEffect(() => {
    let isCancelled = false;

    async function loadFontFamilies() {
      const nextFamilies: Record<string, string> = {
        default: fallbackPreviewFontFamily,
      };
      for (const font of fonts) {
        if (font.id === "default") {
          nextFamilies[font.id] = fallbackPreviewFontFamily;
          continue;
        }
        const isFileFont = /\.(ttf|otf)$/i.test(font.id);
        if (!isFileFont) {
          nextFamilies[font.id] = `"${font.id}", ${fallbackPreviewFontFamily}`;
          continue;
        }
        const familyId = `mw_font_${font.id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
        const fontUrl = `${apiBaseUrl}/media/fonts/${encodeURIComponent(font.id)}`;
        try {
          const fontFace = new FontFace(familyId, `url(${fontUrl})`);
          await fontFace.load();
          if (isCancelled) return;
          document.fonts.add(fontFace);
          nextFamilies[font.id] = `"${familyId}", ${fallbackPreviewFontFamily}`;
        } catch {
          nextFamilies[font.id] = fallbackPreviewFontFamily;
        }
      }
      if (!isCancelled) setFontFamilyById(nextFamilies);
    }

    if (fonts.length === 0) {
      setFontFamilyById({
        default: fallbackPreviewFontFamily,
      });
    } else {
      void loadFontFamilies();
    }
    return () => {
      isCancelled = true;
    };
  }, [fonts]);

  // ---------------------------------------------------------------------------
  // Browser notifications
  // ---------------------------------------------------------------------------

  /**
   * Normalize a caption's hashtag line for display and posting.
   * The AI returns plain words on the last line — this prefixes each with #.
   * Words already starting with # are left untouched.
   */
  function formatCaptionHashtags(caption: string): string {
    if (!caption?.trim()) return caption ?? "";
    const lines = caption.split("\n");
    // Find last non-empty line
    let lastIdx = lines.length - 1;
    while (lastIdx >= 0 && !lines[lastIdx].trim()) lastIdx--;
    if (lastIdx < 0) return caption;

    const lastLine = lines[lastIdx].trim();
    const tokens = lastLine.split(/\s+/).filter(Boolean);
    // Only treat as hashtag line if 2+ tokens and all are word-chars (with optional leading #)
    const looksLikeTagLine =
      tokens.length >= 2 &&
      tokens.every((t) => /^#?[a-zA-Z0-9_\u00C0-\u024F]+$/.test(t));

    if (!looksLikeTagLine) return caption;

    const tagLine = tokens
      .map((t) => (t.startsWith("#") ? t : `#${t}`))
      .join(" ");
    return [...lines.slice(0, lastIdx), tagLine].join("\n");
  }

  function sendNotification(title: string, body: string) {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/favicon.ico" });
    } else if (Notification.permission === "default") {
      void Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          new Notification(title, { body, icon: "/favicon.ico" });
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Data loaders
  // ---------------------------------------------------------------------------

  async function loadClips() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/clips`);
      if (!response.ok) return;
      const data = (await response.json()) as ClipItem[];
      setClips(Array.isArray(data) ? data : []);
      if (!selectedClipName && Array.isArray(data) && data.length > 0) {
        setSelectedClipName(data[0].name);
      }
    } catch {
      setClips([]);
    }
  }

  async function loadVoices() {
    const response = await fetch(`${apiBaseUrl}/api/reels/voices`);
    if (!response.ok) throw new Error("Failed to load voices");
    const data = (await response.json()) as VoicesResponse & {
      defaultVoiceId?: string;
    };
    setVoiceEngine(data.defaultEngine);
    setPyttsx3Voices(data.pyttsx3);
    setEdgeVoices(data.edge);
    setPiperCatalog(data.piper.catalog);

    // Honour explicit defaultVoiceId from the API (e.g. fil-PH-BlessicaNeural)
    if (data.defaultVoiceId) {
      setSelectedVoiceId(data.defaultVoiceId);
      return;
    }
    const firstInstalledPiper = data.piper.catalog.find((v) => v.installed);
    if (data.defaultEngine === "piper" && firstInstalledPiper) {
      setSelectedVoiceId(firstInstalledPiper.id);
      return;
    }
    if (data.defaultEngine === "pyttsx3" && data.pyttsx3.length > 0) {
      setSelectedVoiceId(data.pyttsx3[0].id);
      return;
    }
    if (data.defaultEngine === "edge" && data.edge.length > 0) {
      setSelectedVoiceId(data.edge[0].id);
      return;
    }
    if (!selectedVoiceId && data.piper.catalog.length > 0) {
      setSelectedVoiceId(data.piper.catalog[0].id);
    }
  }

  async function loadFonts() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/reels/fonts`);
      if (!response.ok) return;
      const data = (await response.json()) as FontsResponse;
      const items = Array.isArray(data?.items) ? data.items : [];
      setFonts(items);
      const defaultFont = data?.defaultFont ?? "default";
      const kidmania = items.find((f) =>
        f.id?.toLowerCase().includes("kidmania"),
      );
      const preferredFont = kidmania?.id ?? defaultFont;
      const selectedExists = items.some((item) => item.id === selectedFontName);
      if (!selectedExists) setSelectedFontName(preferredFont);
    } catch {
      setFonts([]);
    }
  }

  async function loadReels() {
    const response = await fetch(`${apiBaseUrl}/api/reels`);
    if (!response.ok) throw new Error("Failed to load reels");
    const data: ReelItem[] = await response.json();
    setReels(data);
  }

  async function loadAllAccounts() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/accounts`);
      if (!response.ok) throw new Error("Failed to load accounts");
      const data = (await response.json()) as SocialAccount[];
      setAllAccounts(data);
    } catch {
      // non-fatal
    }
  }

  async function loadNiches() {
    try {
      const res = await fetch(`${apiBaseUrl}/api/captions/niches`);
      if (!res.ok) return;
      const data = (await res.json()) as NicheItem[];
      setNiches(data);
      if (data.length > 0 && !data.find((n) => n.id === captionNiche)) {
        setCaptionNiche(data[0].id);
      }
      if (data.length > 0 && !scriptNicheInput.trim()) {
        const match = data.find((n) => n.id === captionNiche);
        setScriptNicheInput(match?.label ?? data[0].label);
      }
    } catch {
      // non-fatal
    }
  }

  async function loadPipelines() {
    try {
      const res = await fetch(`${apiBaseUrl}/api/pipeline`);
      if (!res.ok) return;
      const list = (await res.json()) as Pipeline[];
      setPipelines(list);
      // Refresh running status per pipeline
      const runningIds = new Set<string>();
      await Promise.all(
        list.map(async (p) => {
        try {
            const sr = await fetch(`${apiBaseUrl}/api/pipeline/${p.id}/status`);
          if (sr.ok) {
              const s = (await sr.json()) as Pipeline & { isRunning: boolean };
              if (s.isRunning) runningIds.add(p.id);
            }
          } catch {
            /* non-fatal */
          }
        }),
      );
      setPipelineRunningIds(runningIds);
    } catch {
      // non-fatal
    }
  }

  async function handleSavePipeline(id: string, data: Partial<Pipeline>) {
    try {
      const res = await fetch(`${apiBaseUrl}/api/pipeline/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save");
      await loadPipelines();
      setEditingPipeline(null);
      setPipelineMessage("Pipeline saved.");
    } catch {
      setPipelineMessage("Failed to save pipeline.");
    }
  }

  async function handleCreatePipeline(
    data: Partial<Pipeline> & { label: string },
  ) {
    try {
      const res = await fetch(`${apiBaseUrl}/api/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      await loadPipelines();
      setShowNewPipelineForm(false);
      setPipelineMessage("Pipeline created.");
    } catch {
      setPipelineMessage("Failed to create pipeline.");
    }
  }

  async function handleDeletePipeline(id: string) {
    if (!confirm("Delete this pipeline?")) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/pipeline/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      await loadPipelines();
      setPipelineMessage("Pipeline deleted.");
    } catch {
      setPipelineMessage("Failed to delete pipeline.");
    }
  }

  async function handleRunPipeline(id: string, label: string) {
    setPipelineRunningIds((s) => new Set([...s, id]));
    setPipelineMessage(`"${label}" started...`);
    try {
      const res = await fetch(`${apiBaseUrl}/api/pipeline/${id}/run`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to trigger");
      sendNotification(
        `Pipeline "${label}" started`,
        "Generating script, rendering reel, awaiting approval for Facebook upload...",
      );
    } catch {
      setPipelineMessage(`Failed to start "${label}".`);
      setPipelineRunningIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  async function handlePostSomethingForNiche(niche: NicheItem) {
    const pipeline = pipelines.find((p) => p.nicheId === niche.id);
    if (!pipeline) {
      setNicheMessage(
        `No pipeline uses "${niche.label}". Add or edit a pipeline in Auto Pipelines to use this niche.`,
      );
      return;
    }
    setNicheMessage("");
    setPostingNicheId(niche.id);
    try {
      await handleRunPipeline(pipeline.id, pipeline.label);
    } finally {
      setPostingNicheId(null);
    }
  }

  async function handlePostReelForNiche(niche: NicheItem) {
    const pipeline = pipelines.find((p) => p.nicheId === niche.id);
    if (!pipeline) {
      setNicheMessage(
        `No pipeline uses "${niche.label}". Add or edit a pipeline in Auto Pipelines to use this niche.`,
      );
      return;
    }
    setNicheMessage("");
    setPostingReelNicheId(niche.id);
    setPipelineRunningIds((s) => new Set([...s, pipeline.id]));
    setPipelineMessage(`"${pipeline.label}" started (reel)...`);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/pipeline/${pipeline.id}/run?forceReel=true`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("Failed to trigger");
      sendNotification(
        `Reel pipeline "${pipeline.label}" started`,
        "Generating script, rendering reel, awaiting approval for Facebook upload...",
      );
    } catch {
      setPipelineMessage(`Failed to start reel for "${niche.label}".`);
      setPipelineRunningIds((s) => {
        const n = new Set(s);
        n.delete(pipeline.id);
        return n;
      });
    } finally {
      setPostingReelNicheId(null);
    }
  }

  async function handleRunAll() {
    setPipelineMessage("Starting all pipelines...");
    try {
      const res = await fetch(`${apiBaseUrl}/api/pipeline/run-all`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { queued: string[] };
      setPipelineRunningIds((s) => new Set([...s, ...data.queued]));
      setPipelineMessage(`${data.queued.length} pipeline(s) queued.`);
      sendNotification(
        "All pipelines started",
        `${data.queued.length} pipeline(s) are now running.`,
      );
    } catch {
      setPipelineMessage("Failed to start all pipelines.");
    }
  }

  async function handleStopPipeline(id: string, label: string) {
    try {
      const res = await fetch(`${apiBaseUrl}/api/pipeline/${id}/stop`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { stopped: boolean };
      setPipelineMessage(
        data.stopped
          ? `Stop requested for "${label}".`
          : `"${label}" is not running.`,
      );
    } catch {
      setPipelineMessage(`Failed to stop "${label}".`);
    }
  }

  async function handleStopAll() {
    setPipelineMessage("Stopping all running pipelines...");
    try {
      const res = await fetch(`${apiBaseUrl}/api/pipeline/stop-all`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { stopped: string[] };
      setPipelineMessage(
        `Stop requested for ${data.stopped.length} pipeline(s).`,
      );
    } catch {
      setPipelineMessage("Failed to stop pipelines.");
    }
  }

  async function handleUploadFont(e: React.FormEvent) {
    e.preventDefault();
    if (!fontUploadFile) {
      setFontMessage("Choose a .ttf or .otf file.");
      return;
    }
    setFontMessage("");
    try {
      const formData = new FormData();
      formData.append("file", fontUploadFile);
      const res = await fetch(`${apiBaseUrl}/api/fonts`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        throw new Error(err.message ?? "Upload failed");
      }
      setFontUploadFile(null);
      await loadFonts();
      setFontMessage("Font uploaded.");
    } catch (err) {
      setFontMessage(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  async function handleUpdateFont(id: string) {
    if (editingFontId !== id) return;
    setFontMessage("");
    try {
      const res = await fetch(`${apiBaseUrl}/api/fonts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingFontName.trim() }),
      });
      if (!res.ok) throw new Error("Update failed");
      setEditingFontId(null);
      setEditingFontName("");
      await loadFonts();
      setFontMessage("Font updated.");
    } catch {
      setFontMessage("Failed to update font.");
    }
  }

  async function handleDeleteFont(id: string) {
    setFontMessage("");
    try {
      const res = await fetch(`${apiBaseUrl}/api/fonts/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      await loadFonts();
      setFontMessage("Font deleted.");
    } catch {
      setFontMessage("Failed to delete font.");
    }
  }

  async function loadGameClips() {
    const res = await fetch(`${apiBaseUrl}/api/clips`);
    if (!res.ok) return;
    const data = (await res.json()) as ClipItem[];
    setGameClips(data);
  }

  async function loadOrderClips() {
    const res = await fetch(`${apiBaseUrl}/api/order-clips`);
    if (!res.ok) return;
    const data = (await res.json()) as ClipItem[];
    setOrderClips(data);
  }

  async function handleUploadGameClip(e: React.FormEvent) {
    e.preventDefault();
    if (!gameClipUploadFile) {
      setClipMessage("Choose a video file.");
      return;
    }
    setClipMessage("");
    try {
      const formData = new FormData();
      formData.append("file", gameClipUploadFile);
      const res = await fetch(`${apiBaseUrl}/api/clips`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error((await res.json())?.message ?? "Upload failed");
      setGameClipUploadFile(null);
      await loadGameClips();
      await loadClips();
      setClipMessage("Game clip uploaded.");
    } catch (err) {
      setClipMessage(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  async function handleUploadOrderClip(e: React.FormEvent) {
    e.preventDefault();
    if (!orderClipUploadFile) {
      setClipMessage("Choose a video file.");
      return;
    }
    setClipMessage("");
    try {
      const formData = new FormData();
      formData.append("file", orderClipUploadFile);
      const res = await fetch(`${apiBaseUrl}/api/order-clips`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error((await res.json())?.message ?? "Upload failed");
      setOrderClipUploadFile(null);
      await loadOrderClips();
      setClipMessage("Order clip uploaded.");
    } catch (err) {
      setClipMessage(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  async function handleUpdateClip(type: "game" | "order", id: string) {
    if (editingClipId !== id || editingClipType !== type) return;
    setClipMessage("");
    try {
      const base = type === "game" ? `${apiBaseUrl}/api/clips` : `${apiBaseUrl}/api/order-clips`;
      const res = await fetch(`${base}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingClipName.trim() }),
      });
      if (!res.ok) throw new Error("Update failed");
      setEditingClipId(null);
      setEditingClipName("");
      await loadGameClips();
      await loadOrderClips();
      if (type === "game") await loadClips();
      setClipMessage("Clip updated.");
    } catch {
      setClipMessage("Failed to update clip.");
    }
  }

  async function handleDeleteClip(type: "game" | "order", id: string) {
    setClipMessage("");
    try {
      const base = type === "game" ? `${apiBaseUrl}/api/clips` : `${apiBaseUrl}/api/order-clips`;
      const res = await fetch(`${base}/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      await loadGameClips();
      await loadOrderClips();
      if (type === "game") await loadClips();
      setClipMessage("Clip deleted.");
    } catch {
      setClipMessage("Failed to delete clip.");
    }
  }

  async function handleUploadReelTo(
    reel: ReelItem,
    platform: "facebook" | "youtube" | "instagram",
  ) {
    setReelCardUploading((s) => ({ ...s, [reel.id]: platform }));
    setReelCardMessage((s) => ({
      ...s,
      [reel.id]: `Uploading to ${platform}...`,
    }));

    try {
      if (platform === "facebook") {
        if (!facebookAccountId) {
          setReelCardMessage((s) => ({
            ...s,
            [reel.id]: "Select a Facebook account in the Upload panel first.",
          }));
          return;
        }
        const res = await fetch(`${apiBaseUrl}/api/facebook/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reelId: reel.id,
            accountId: facebookAccountId,
            caption: facebookCaption.trim(),
          }),
        });
        if (!res.ok) {
          const e = (await res.json()) as { message?: string };
          throw new Error(e.message ?? "Failed");
        }
        const data = (await res.json()) as {
          facebookUrl: string;
          uploadedPages?: Array<{ name: string }>;
        };
        const pages =
          data.uploadedPages?.map((p) => p.name).join(", ") ?? "Facebook";
        setReelCardMessage((s) => ({
          ...s,
          [reel.id]: `✓ Posted to ${pages}`,
        }));
        await loadReels();
      } else if (platform === "youtube") {
        if (!youtubeAccountId) {
          setReelCardMessage((s) => ({
            ...s,
            [reel.id]: "Select a YouTube account in the Upload panel first.",
          }));
          return;
        }
        const tags = youtubeTagsInput
          .split(/[,\n]/)
          .map((t) => t.trim().replace(/^#/, ""))
          .filter(Boolean);
        const res = await fetch(`${apiBaseUrl}/api/youtube/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reelId: reel.id,
            accountId: youtubeAccountId,
            title: youtubeTitle.trim() || reel.folder,
            description: youtubeDescription.trim(),
            tags,
            privacyStatus: "private",
          }),
        });
        if (!res.ok) {
          const e = (await res.json()) as { message?: string };
          throw new Error(e.message ?? "Failed");
        }
        const data = (await res.json()) as { youtubeUrl: string };
        await markReelUploaded(reel.id, true, data.youtubeUrl);
        setReelCardMessage((s) => ({
          ...s,
          [reel.id]: `✓ Uploaded to YouTube`,
        }));
        await loadReels();
      } else if (platform === "instagram") {
        if (!instagramAccountId) {
          setReelCardMessage((s) => ({
            ...s,
            [reel.id]: "Select an Instagram account in the Upload panel first.",
          }));
          return;
        }
        const res = await fetch(`${apiBaseUrl}/api/facebook/upload-instagram`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reelId: reel.id,
            accountId: instagramAccountId,
            caption: instagramCaption.trim(),
          }),
        });
        if (!res.ok) {
          const e = (await res.json()) as { message?: string };
          throw new Error(e.message ?? "Failed");
        }
        setReelCardMessage((s) => ({
          ...s,
          [reel.id]: `✓ Posted to Instagram`,
        }));
        await loadReels();
      }
    } catch (err) {
      setReelCardMessage((s) => ({
        ...s,
        [reel.id]:
          err instanceof Error ? err.message : `${platform} upload failed.`,
      }));
    } finally {
      setReelCardUploading((s) => {
        const n = { ...s };
        delete n[reel.id];
        return n;
      });
    }
  }

  function openShowcaseModal(reel: ReelItem) {
    setShowcaseReel(reel);
    setShowcaseTitleInput(reel.showcaseTitle ?? reel.folder);
    setShowcaseDescInput(reel.showcaseDescription ?? "");
    setShowcaseMessage("");
  }

  function closeShowcaseModal() {
    setShowcaseReel(null);
    setShowcaseSaving(false);
    setShowcaseMessage("");
  }

  async function handleSaveShowcase() {
    if (!showcaseReel) return;
    setShowcaseSaving(true);
    setShowcaseMessage("");
    try {
      const url = `${apiBaseUrl}/api/reels/${encodeURIComponent(showcaseReel.id)}/showcase`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showcase: true,
          showcaseTitle: showcaseTitleInput.trim() || undefined,
          showcaseDescription: showcaseDescInput.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg = (errBody as { message?: string }).message ?? res.statusText;
        throw new Error(msg || "Failed to update showcase");
      }
      await loadReels();
      closeShowcaseModal();
    } catch (err) {
      setShowcaseMessage(
        err instanceof Error ? err.message : "Failed to save. Try again.",
      );
    } finally {
      setShowcaseSaving(false);
    }
  }

  async function handleUnstarShowcase(reel: ReelItem) {
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/reels/${encodeURIComponent(reel.id)}/showcase`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ showcase: false }),
        },
      );
      if (!res.ok) throw new Error("Failed");
      await loadReels();
    } catch {
      setReelCardMessage((s) => ({ ...s, [reel.id]: "Failed to unstar." }));
    }
  }

  async function handleAddNiche(e: React.FormEvent) {
    e.preventDefault();
    if (!newNicheLabel.trim()) {
      setNicheMessage("Label is required.");
      return;
    }
    const feeds = newNicheFeeds
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
    if (feeds.length === 0) {
      setNicheMessage("At least one RSS feed URL is required.");
      return;
    }
    try {
      const res = await fetch(`${apiBaseUrl}/api/captions/niches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newNicheLabel.trim(),
          keywords: newNicheKeywords.trim(),
          rssFeeds: feeds,
        }),
      });
      if (!res.ok) throw new Error("Failed to create niche");
      setNewNicheLabel("");
      setNewNicheKeywords("");
      setNewNicheFeeds("");
      setNicheMessage("Niche added.");
      await loadNiches();
    } catch {
      setNicheMessage("Failed to add niche.");
    }
  }

  async function handleDeleteNiche(id: string) {
    try {
      await fetch(`${apiBaseUrl}/api/captions/niches/${id}`, {
        method: "DELETE",
      });
      await loadNiches();
    } catch {
      setNicheMessage("Failed to delete niche.");
    }
  }

  function startEditNiche(niche: NicheItem) {
    setEditingNicheId(niche.id);
    setEditNicheLabel(niche.label);
    setEditNicheKeywords(niche.keywords);
    setEditNicheFeeds(niche.rssFeeds.join("\n"));
  }

  async function handleSaveNiche(id: string) {
    const feeds = editNicheFeeds
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
    try {
      const res = await fetch(`${apiBaseUrl}/api/captions/niches/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: editNicheLabel.trim(),
          keywords: editNicheKeywords.trim(),
          rssFeeds: feeds,
        }),
      });
      if (!res.ok) throw new Error("Failed to update niche");
      setEditingNicheId(null);
      await loadNiches();
    } catch {
      setNicheMessage("Failed to save niche.");
    }
  }

  async function loadYoutubeStatus() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/youtube/status`);
      if (!response.ok) throw new Error("Failed to load YouTube status");
      const data = (await response.json()) as YoutubeStatusResponse;
      setYoutubeConfigured(data.configured);
    } catch {
      setYoutubeConfigured(false);
    }
  }

  async function loadFacebookStatus() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/facebook/status`);
      if (!response.ok) throw new Error("Failed to load Facebook status");
      const data = (await response.json()) as FacebookStatusResponse;
      setFacebookConfigured(data.configured);
    } catch {
      setFacebookConfigured(false);
    }
  }

  async function refreshAll() {
    setStatusMessage("Refreshing...");
    try {
      await Promise.all([
        loadClips(),
        loadVoices(),
        loadFonts(),
        loadReels(),
        loadAllAccounts(),
        loadYoutubeStatus(),
        loadFacebookStatus(),
      ]);
      setStatusMessage("Dashboard refreshed.");
    } catch {
      setStatusMessage("Refresh failed.");
    }
  }

  // ---------------------------------------------------------------------------
  // Settings — account management
  // ---------------------------------------------------------------------------

  async function handleAddAccount(event: FormEvent) {
    event.preventDefault();
    if (!newAccountLabel.trim()) {
      setSettingsMessage("Enter a label for the account.");
      return;
    }
    setSettingsMessage("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: newAccountPlatform,
          label: newAccountLabel.trim(),
        }),
      });
      if (!response.ok) throw new Error("Failed to create account");
      const account = (await response.json()) as SocialAccount;
      await loadAllAccounts();
      setNewAccountLabel("");
      setSettingsMessage(
        `Account "${account.label}" created. Click Connect to authorize it.`,
      );
    } catch {
      setSettingsMessage("Failed to create account.");
    }
  }

  async function handleConnectAccount(accountId: string, platform: Platform) {
    try {
      const endpoint =
        platform === "youtube"
          ? `${apiBaseUrl}/api/youtube/auth-url?accountId=${accountId}`
          : `${apiBaseUrl}/api/facebook/auth-url?accountId=${accountId}`;
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error("Failed to get auth URL");
      const data = (await response.json()) as { url: string };
      window.location.href = data.url;
    } catch {
      setSettingsMessage("Failed to start authorization.");
    }
  }

  async function handleDisconnectAccount(accountId: string) {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/accounts/${accountId}/disconnect`,
        {
          method: "POST",
        },
      );
      if (!response.ok) throw new Error("Failed to disconnect");
      await loadAllAccounts();
    } catch {
      setSettingsMessage("Failed to disconnect account.");
    }
  }

  async function handleDeleteAccount(accountId: string) {
    try {
      const response = await fetch(`${apiBaseUrl}/api/accounts/${accountId}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 204)
        throw new Error("Failed to delete");
      await loadAllAccounts();
    } catch {
      setSettingsMessage("Failed to delete account.");
    }
  }

  // ---------------------------------------------------------------------------
  // YouTube upload
  // ---------------------------------------------------------------------------

  async function handleUploadLatestToYoutube() {
    if (!latestReel) {
      setYoutubeMessage("No generated reel available to upload.");
      return;
    }
    if (!youtubeTitle.trim()) {
      setYoutubeMessage("Please add a YouTube title.");
      return;
    }
    if (!youtubeAccountId) {
      setYoutubeMessage("Select a YouTube account.");
      return;
    }
    setYoutubeUploading(true);
    setYoutubeMessage("");
    const tags = youtubeTagsInput
      .split(/[,\n]/)
      .map((tag) => tag.trim().replace(/^#/, ""))
      .filter(Boolean);
    try {
      const response = await fetch(`${apiBaseUrl}/api/youtube/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reelId: latestReel.id,
          accountId: youtubeAccountId,
          title: youtubeTitle.trim(),
          description: youtubeDescription.trim(),
          tags,
          privacyStatus: "private",
        }),
      });
      if (!response.ok) {
        const err = (await response.json()) as { message?: string };
        throw new Error(err.message ?? "Upload failed");
      }
      const data = (await response.json()) as { youtubeUrl: string };
      await markReelUploaded(latestReel.id, true, data.youtubeUrl);
      setYoutubeMessage(`Uploaded to YouTube: ${data.youtubeUrl}`);
    } catch (error) {
      setYoutubeMessage(
        error instanceof Error ? error.message : "YouTube upload failed.",
      );
    } finally {
      setYoutubeUploading(false);
    }
  }

  function applyTrendingHashtags() {
    const nicheTagMap: Record<string, string[]> = {
      gaming: [
        "shorts",
        "youtubeshorts",
        "viral",
        "trending",
        "fyp",
        "gaming",
        "gamer",
        "gameplay",
        "gaminglife",
        "videogames",
        "gamingcommunity",
        "viralshorts",
        "reels",
      ],
      tech: [
        "shorts",
        "youtubeshorts",
        "viral",
        "trending",
        "fyp",
        "tech",
        "technology",
        "innovation",
        "techlife",
        "gadgets",
        "futuretech",
        "aitech",
        "reels",
      ],
      sports: [
        "shorts",
        "youtubeshorts",
        "viral",
        "trending",
        "fyp",
        "sports",
        "athlete",
        "winning",
        "champion",
        "fitness",
        "sportsmotivation",
        "sportslife",
        "reels",
      ],
      entertainment: [
        "shorts",
        "youtubeshorts",
        "viral",
        "trending",
        "fyp",
        "entertainment",
        "celebrity",
        "popculture",
        "showbiz",
        "mustwatch",
        "reels",
      ],
      news: [
        "shorts",
        "youtubeshorts",
        "viral",
        "trending",
        "fyp",
        "news",
        "breakingnews",
        "latestnews",
        "currentevents",
        "mustwatch",
        "reels",
      ],
      philippines: [
        "shorts",
        "youtubeshorts",
        "viral",
        "trending",
        "fyp",
        "philippines",
        "pilipinas",
        "pinoy",
        "phtrending",
        "balita",
        "filipinonews",
        "reels",
      ],
    };
    const tags = nicheTagMap[captionNiche] ?? nicheTagMap["news"];
    setYoutubeTagsInput(tags.join(", "));
  }

  // ---------------------------------------------------------------------------
  // Facebook upload
  // ---------------------------------------------------------------------------

  async function handleUploadLatestToFacebook() {
    if (!latestReel) {
      setFacebookMessage("No generated reel available to upload.");
      return;
    }
    if (!facebookAccountId) {
      setFacebookMessage("Select a Facebook account.");
      return;
    }
    setFacebookUploading(true);
    setFacebookMessage("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/facebook/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reelId: latestReel.id,
          accountId: facebookAccountId,
          caption: facebookCaption.trim(),
        }),
      });
      if (!response.ok) {
        const err = (await response.json()) as { message?: string };
        throw new Error(err.message ?? "Upload failed");
      }
      const data = (await response.json()) as {
        facebookUrl: string;
        facebookUrls?: string[];
        partial?: boolean;
        uploadedPages?: Array<{ id: string; name: string }>;
        failedPages?: Array<{ id: string; name: string; error: string }>;
      };
      setFacebookLastPostUrl(data.facebookUrls?.[0] ?? data.facebookUrl);
      if (data.facebookUrls && data.facebookUrls.length > 1) {
        const posted =
          data.uploadedPages?.map((p) => p.name).join(", ") ??
          `${data.facebookUrls.length} pages`;
        if (data.partial) {
          const failed =
            data.failedPages?.map((p) => p.name).join(", ") ?? "some pages";
          setFacebookMessage(`Posted to: ${posted}. Failed: ${failed}.`);
        } else {
          setFacebookMessage(`Posted to all pages: ${posted}.`);
        }
      } else {
        setFacebookMessage(`Posted to Facebook: ${data.facebookUrl}`);
      }
    } catch (error) {
      setFacebookMessage(
        error instanceof Error ? error.message : "Facebook upload failed.",
      );
    } finally {
      setFacebookUploading(false);
    }
  }

  async function handleShareLatestFacebookPostToOtherPages() {
    if (!facebookAccountId) {
      setFacebookMessage("Select a Facebook account.");
      return;
    }
    if (!facebookLastPostUrl) {
      setFacebookMessage("Post to Facebook first, then share it.");
      return;
    }

    setFacebookSharing(true);
    try {
      const sourcePageId = parseFacebookPageIdFromUrl(facebookLastPostUrl);
      const response = await fetch(`${apiBaseUrl}/api/facebook/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: facebookAccountId,
          postUrl: facebookLastPostUrl,
          sourcePageId,
          message: "",
        }),
      });
      if (!response.ok) {
        const err = (await response.json()) as { message?: string };
        throw new Error(err.message ?? "Share failed");
      }
      const data = (await response.json()) as {
        sharedPages: Array<{ id: string; name: string }>;
        failedPages?: Array<{ id: string; name: string; error: string }>;
        partial?: boolean;
      };
      const okNames = data.sharedPages.map((p) => p.name).join(", ");
      if (data.partial) {
        const badNames =
          data.failedPages?.map((p) => p.name).join(", ") ?? "some pages";
        setFacebookMessage(`Shared to: ${okNames}. Failed: ${badNames}.`);
      } else {
        setFacebookMessage(`Shared to other pages: ${okNames}`);
      }
    } catch (error) {
      setFacebookMessage(
        error instanceof Error ? error.message : "Facebook share failed.",
      );
    } finally {
      setFacebookSharing(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Instagram upload
  // ---------------------------------------------------------------------------

  async function handleUploadLatestToInstagram() {
    if (!latestReel) {
      setInstagramMessage("No generated reel available to upload.");
      return;
    }
    if (!instagramAccountId) {
      setInstagramMessage("Select an Instagram account.");
      return;
    }
    setInstagramUploading(true);
    setInstagramMessage("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/facebook/upload-instagram`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reelId: latestReel.id,
          accountId: instagramAccountId,
          caption: instagramCaption.trim(),
        }),
        },
      );
      if (!response.ok) {
        const err = (await response.json()) as { message?: string };
        throw new Error(err.message ?? "Upload failed");
      }
      const data = (await response.json()) as { instagramUrl: string };
      setInstagramMessage(`Posted to Instagram: ${data.instagramUrl}`);
    } catch (error) {
      setInstagramMessage(
        error instanceof Error ? error.message : "Instagram upload failed.",
      );
    } finally {
      setInstagramUploading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Caption suggestion
  // ---------------------------------------------------------------------------

  async function handleSuggestCaption(target: "facebook" | "instagram") {
    setCaptionSuggesting(true);
    setCaptionSuggestTarget(target);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/captions/suggest?niche=${encodeURIComponent(captionNiche)}&lang=${captionLang}`,
      );
      if (!res.ok) throw new Error("Failed to fetch caption suggestion");
      const data = (await res.json()) as {
        caption: string;
        headline: string;
        source: string;
        ollamaAvailable: boolean;
      };
      const formatted = formatCaptionHashtags(data.caption);
      if (target === "facebook") {
        setFacebookCaption(formatted);
      } else {
        setInstagramCaption(formatted);
      }
    } catch (err) {
      console.error("Caption suggestion failed:", err);
    } finally {
      setCaptionSuggesting(false);
      setCaptionSuggestTarget(null);
    }
  }

  async function handleSuggestNegativeCaption(
    target: "facebook" | "instagram",
  ) {
    setNegativeCaptionSuggesting(true);
    setNegativeCaptionSuggestTarget(target);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/captions/suggest/negative?niche=${encodeURIComponent(captionNiche)}&lang=${captionLang}`,
      );
      if (!res.ok)
        throw new Error("Failed to fetch negative caption suggestion");
      const data = (await res.json()) as {
        caption: string;
        headline: string;
        source: string;
        ollamaAvailable: boolean;
      };
      const formatted = formatCaptionHashtags(data.caption);
      if (target === "facebook") {
        setFacebookCaption(formatted);
      } else {
        setInstagramCaption(formatted);
      }
    } catch (err) {
      console.error("Negative caption suggestion failed:", err);
    } finally {
      setNegativeCaptionSuggesting(false);
      setNegativeCaptionSuggestTarget(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Script generation from trending news
  // ---------------------------------------------------------------------------

  async function handleGenerateScript() {
    setScriptGenerating(true);
    try {
      const niche = resolveScriptNicheId();
      const res = await fetch(
        `${apiBaseUrl}/api/captions/script?niche=${encodeURIComponent(niche)}&lang=${captionLang}`,
      );
      if (!res.ok) throw new Error("Failed to generate script");
      const data = (await res.json()) as {
        script: string;
        title: string;
        headline: string;
        source: string;
        ollamaAvailable: boolean;
      };
      setScript(data.script);
      setTitle(data.title);
    } catch (err) {
      console.error("Script generation failed:", err);
    } finally {
      setScriptGenerating(false);
    }
  }

  async function handleGenerateNegativeScript() {
    setNegativeScriptGenerating(true);
    try {
      const niche = resolveScriptNicheId();
      const res = await fetch(
        `${apiBaseUrl}/api/captions/script/negative?niche=${encodeURIComponent(niche)}&lang=${captionLang}`,
      );
      if (!res.ok) throw new Error("Failed to generate negative script");
      const data = (await res.json()) as {
        script: string;
        title: string;
        headline: string;
        source: string;
        ollamaAvailable: boolean;
      };
      setScript(data.script);
      setTitle(data.title);
    } catch (err) {
      console.error("Negative script generation failed:", err);
    } finally {
      setNegativeScriptGenerating(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Reels helpers
  // ---------------------------------------------------------------------------

  async function markReelUploaded(
    reelId: string,
    uploaded: boolean,
    youtubeUrl?: string,
  ) {
    const response = await fetch(
      `${apiBaseUrl}/api/reels/${encodeURIComponent(reelId)}/uploaded`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploaded,
          youtubeUrl: uploaded ? youtubeUrl : undefined,
        }),
      },
    );
    if (!response.ok) throw new Error("Failed to update reel upload state");
    await loadReels();
  }

  async function handleMarkAllUploaded() {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/reels/mark-all-uploaded`,
        {
          method: "POST",
        },
      );
      if (!response.ok) throw new Error("Failed to mark all uploaded");
      await loadReels();
      setYoutubeMessage("Existing reels flagged as uploaded.");
    } catch {
      setYoutubeMessage("Unable to mark existing reels.");
    }
  }

  async function refreshActiveJobs() {
    const currentJobs = jobs;
    const previousStatuses = new Map(
      currentJobs.map((job) => [job.id, job.status] as const),
    );
    const nextJobs = await Promise.all(
      currentJobs.map(async (job) => {
        if (job.status === "completed" || job.status === "failed") return job;
        const response = await fetch(`${apiBaseUrl}/api/reels/jobs/${job.id}`);
        if (!response.ok) {
          if (response.status === 404) {
            return {
              ...job,
              status: "failed" as const,
              error:
                "Job state was cleared (API restarted). Refresh reels list.",
            };
          }
          return job;
        }
        return (await response.json()) as ReelJob;
      }),
    );
    setJobs(nextJobs);
    const hasNewCompleted = nextJobs.some((job) => {
      const previousStatus = previousStatuses.get(job.id);
      return job.status === "completed" && previousStatus !== "completed";
    });
    const hasNewFailed = nextJobs.some((job) => {
      const previousStatus = previousStatuses.get(job.id);
      return job.status === "failed" && previousStatus !== "failed";
    });
    if (hasNewCompleted) {
      setStatusMessage("A reel finished successfully.");
      await loadReels();
      await loadOrders();
      const completedJob = nextJobs.find(
        (j) => j.status === "completed" && previousStatuses.get(j.id) !== "completed",
      );
      const completedOrderId = completedJob?.orderId;
      if (completedOrderId) {
        setProcessingOrders((prev) => {
          const next = { ...prev };
          delete next[completedOrderId];
          return next;
        });
      }
      navigate("/outputs");
      sendNotification(
        "Reel ready 🎬",
        "Generation and upload are done. Open Outputs to preview or share.",
      );
    }
    if (hasNewFailed) {
      sendNotification(
        "Reel Failed ❌",
        "Something went wrong during generation. Check the job status.",
      );
    }
  }

  async function handleUpload() {
    if (!selectedFiles?.length) {
      setStatusMessage("Select one or more clips first.");
      return;
    }
    setIsUploading(true);
    setStatusMessage("");
    try {
      const formData = new FormData();
      for (const file of Array.from(selectedFiles)) {
        formData.append("files", file);
      }
      const response = await fetch(`${apiBaseUrl}/api/clips/upload`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");
      await loadClips();
      setSelectedFiles(null);
      setStatusMessage("Clips uploaded.");
    } catch (error) {
      console.error(error);
      setStatusMessage("Upload failed. Check file type and try again.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleCreateReel(event: FormEvent) {
    event.preventDefault();
    if (!script.trim() && !studioUseClipAudio) {
      setStatusMessage("Script is required.");
      return;
    }
    if (bgMode === "clip" && !selectedClipName) {
      setStatusMessage(
        "Select a gameplay clip or choose a different background mode.",
      );
      return;
    }
    if (voiceEngine === "piper" && !isSelectedPiperInstalled) {
      setStatusMessage("Install the selected Piper voice first.");
      return;
    }
    const useClipAudioForProcess = studioUseClipAudio || studioUseClipAudioWithNarrator;
    if (useClipAudioForProcess && selectedOrder?.id && studioOrderClipName) {
      const scriptReady =
        studioTranscriptReady ||
        (studioUseClipAudioWithNarrator && script.trim().length > 0);
      if (!scriptReady) {
        setStatusMessage(
          studioUseClipAudioWithNarrator
            ? "Enter a script for the narrator, or wait for the clip transcript."
            : "Transcript not ready yet for this clip.",
        );
        return;
      }
      setIsCreating(true);
      setStatusMessage("");
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/orders/${selectedOrder.id}/process`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              useClipAudio: true,
              useClipAudioWithNarrator: studioUseClipAudioWithNarrator || undefined,
              script: script.trim() || undefined,
            }),
          },
        );
        if (!response.ok) throw new Error("Failed to process order");
        const created = (await response.json()) as {
          jobId: string;
          status: ReelJob["status"];
          progress: number;
        };
        setJobs((previous) => [
          {
            id: created.jobId,
            status: created.status,
            progress: created.progress,
          },
          ...previous,
        ]);
        await handleSetOrderStatus(selectedOrder.id, "processing");
        setStatusMessage("Order processing queued.");
      } catch (error) {
        console.error(error);
        setStatusMessage("Failed to process order.");
      } finally {
        setIsCreating(false);
      }
      return;
    }

    setIsCreating(true);
    setStatusMessage("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/reels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: script.trim(),
          title: title.trim() || undefined,
          clipName: bgMode === "clip" ? selectedClipName : undefined,
          fontName: selectedFontName || undefined,
          voiceEngine,
          voiceName: selectedVoiceId || undefined,
          voiceRate: 180,
          bgMode,
          ...(studioUseClipAudio && {
            voiceEngine: "none",
            voiceName: undefined,
            useClipAudio: true,
          }),
          ...(selectedOrder && {
            orderId: selectedOrder.id,
            outputSize: ["phone", "tablet", "laptop", "desktop"].includes(
              selectedOrder.outputSize ?? "",
            )
              ? selectedOrder.outputSize
              : "phone",
            scriptPosition:
              selectedOrder.scriptPosition &&
              ["top", "center", "bottom"].includes(selectedOrder.scriptPosition)
                ? selectedOrder.scriptPosition
                : undefined,
            scriptStyle: selectedOrder.scriptStyle ?? undefined,
          }),
          ...(!selectedOrder && {
            scriptPosition: studioScriptPosition,
            scriptStyle:
              studioScriptStyle.fontScale !== 1 || studioScriptStyle.bgOpacity !== 180
                ? studioScriptStyle
                : undefined,
          }),
        }),
      });
      if (!response.ok) throw new Error("Failed to create reel job");
      const created = (await response.json()) as {
        jobId: string;
        status: ReelJob["status"];
        progress: number;
      };
      setJobs((previous) => [
        {
          id: created.jobId,
          status: created.status,
          progress: created.progress,
        },
        ...previous,
      ]);
      setStatusMessage("Reel job queued.");
      setScript("");
      setTitle("");
    } catch (error) {
      console.error(error);
      setStatusMessage("Failed to create reel job.");
    } finally {
      setIsCreating(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const selectedPiperVoice = piperCatalog.find(
    (voice) => voice.id === selectedVoiceId,
  );
  const isSelectedPiperInstalled = selectedPiperVoice?.installed ?? false;
  const selectedClip = clips.find((clip) => clip.name === selectedClipName);
  /** URL for preview: catalog clip or order-upload clip (order-clips not listed in GET /api/clips) */
  const clipPreviewUrl =
    selectedClip?.url ??
    (selectedClipName?.startsWith("order-")
      ? `/media/order-clips/${selectedClipName}`
      : null);
  const studioOrderClipName = selectedOrder?.clipName ?? null;
  const studioTranscriptInfo = studioOrderClipName
    ? orderClipTranscripts[studioOrderClipName]
    : null;
  const studioTranscriptReady = studioTranscriptInfo?.status === "completed";
  const studioUseClipAudio = selectedOrder?.id && studioOrderClipName
    ? (orderUseClipAudio[selectedOrder.id] ?? selectedOrder.useClipAudio ?? false)
    : false;
  const studioUseClipAudioWithNarrator =
    selectedOrder?.id && studioOrderClipName
      ? (orderUseClipAudioWithNarrator[selectedOrder.id] ??
          selectedOrder.useClipAudioWithNarrator ??
          false)
      : false;
  const activeStudioJob = jobs.find(
    (job) => job.status === "processing" || job.status === "queued",
  );
  const previewFontFamily =
    fontFamilyById[selectedFontName] ?? fallbackPreviewFontFamily;
  const latestJob = jobs[0];
  const latestReel = reels[0];
  const newReels = reels.filter((reel) => !reel.uploaded);
  const uploadedReels = reels.filter((reel) => reel.uploaded);
  const selectedOrderReels = useMemo(
    () =>
      selectedOrder
        ? reels.filter((reel) => reel.orderId === selectedOrder.id)
        : [],
    [reels, selectedOrder?.id],
  );

  // Per-platform duplicate upload guards for the latest reel
  const latestReelUploadedToFacebook =
    latestReel?.uploadLog?.some(
      (r) => r.platform === "facebook" && r.accountId === facebookAccountId,
    ) ?? false;
  const latestReelUploadedToInstagram =
    latestReel?.uploadLog?.some(
      (r) => r.platform === "instagram" && r.accountId === instagramAccountId,
    ) ?? false;
  const latestReelUploadedToYoutube =
    latestReel?.uploadLog?.some(
      (r) => r.platform === "youtube" && r.accountId === youtubeAccountId,
    ) ?? false;

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderAccountList(
    accounts: SocialAccount[],
    platform: Platform,
    platformLabel: string,
  ) {
    return (
      <div className="settings-platform-section">
        <h3>{platformLabel}</h3>
        {accounts.length === 0 ? (
          <p className="muted small">No {platformLabel} accounts added yet.</p>
        ) : (
          <div className="account-list">
            {accounts.map((account) => (
              <div key={account.id} className="account-row">
                <div className="account-row-info">
                  <span className="account-label">{account.label}</span>
                  <span
                    className={`account-status ${account.connected ? "connected" : "disconnected"}`}
                  >
                    {account.connected ? "Connected" : "Not connected"}
                  </span>
                </div>
                <div className="account-row-actions">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() =>
                      void handleConnectAccount(account.id, platform)
                    }
                  >
                    {account.connected ? "Reconnect" : "Connect"}
                  </button>
                  {account.connected && (
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => void handleDisconnectAccount(account.id)}
                    >
                      Disconnect
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost-btn danger-btn"
                    onClick={() => void handleDeleteAccount(account.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderNicheSelect() {
    return (
      <select
        value={captionNiche}
        onChange={(e) => setCaptionNiche(e.target.value)}
        className="caption-niche-select"
      >
        {niches.length === 0 ? (
          <option value="gaming">Gaming</option>
        ) : (
          niches.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))
        )}
      </select>
    );
  }

  function renderLangSelect() {
    return (
      <select
        value={captionLang}
        onChange={(e) => setCaptionLang(e.target.value as typeof captionLang)}
        className="caption-niche-select"
        title="Language for generated script/caption"
      >
        <option value="auto">🌐 Auto</option>
        <option value="english">🇺🇸 English</option>
        <option value="taglish">🇵🇭 Taglish</option>
        <option value="tagalog">🇵🇭 Tagalog</option>
      </select>
    );
  }

  function resolveScriptNicheId(): string {
    const trimmed = scriptNicheInput.trim();
    if (!trimmed) return captionNiche;
    const lower = trimmed.toLowerCase();
    const matched = niches.find(
      (n) => n.id.toLowerCase() === lower || n.label.toLowerCase() === lower,
    );
    return matched?.id ?? trimmed;
  }

  function renderAccountDropdown(
    accounts: SocialAccount[],
    selectedId: string,
    onChange: (id: string) => void,
    label: string,
  ) {
    const connected = accounts.filter((a) => a.connected);
    if (connected.length === 0) {
      return (
        <p className="muted small">
          No connected {label} accounts. Add one in{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => navigate("/settings")}
          >
            Settings
          </button>
          .
        </p>
      );
    }
    return (
      <label>
        Account
        <select value={selectedId} onChange={(e) => onChange(e.target.value)}>
          {connected.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    <div className="studio-app">
      <header className="topbar">
        <nav className="view-tabs" aria-label="Main">
          <NavLink
            to="/orders"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Orders
            {pendingOrdersCount > 0 && (
              <span className="nav-badge" aria-label={`${pendingOrdersCount} pending`}>
                {pendingOrdersCount}
              </span>
            )}
          </NavLink>
          <NavLink
            to="/"
            className={({ isActive }) => (isActive ? "active" : "")}
            end
          >
            Studio
          </NavLink>
          <NavLink
            to="/outputs"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Outputs
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Settings
          </NavLink>
        </nav>
        <div className="topbar-right">
          {envLabel !== "production" && (
            <span
              className={`env-badge env-badge-${envLabel}`}
              title={`Environment: ${envLabel}`}
            >
              You are running on {envLabel} environment
            </span>
          )}
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void refreshAll()}
          >
            Refresh
          </button>
        </div>
      </header>

      <Routes>
        {/* ------------------------------------------------------------------ */}
        {/* STUDIO (/)                                                          */}
        {/* ------------------------------------------------------------------ */}
        <Route
          path="/"
          element={
            <div className="studio">
              <aside className="studio-sidebar">
                <div className="control-panel studio-control">
                  <h2 className="studio-control-title">Create</h2>
                  <form onSubmit={handleCreateReel} className="studio-form">
                    <section className="studio-block">
                      <label className="studio-label">Script</label>
                      <p className="studio-hint">
                        Paste or type; edit frames in the timeline to fix transcription. Transcripts often mishear acronyms and jargon (e.g. &quot;B2B&quot; → &quot;to be-to-be&quot;, brand names). For clip + narrator, correct the script here and the updated text will be used for the voice and captions.
                      </p>
                      <div className="studio-script-actions">
                        <input
                          type="text"
                          list="script-niche-options"
                          value={scriptNicheInput}
                          onChange={(e) => setScriptNicheInput(e.target.value)}
                          className="studio-input-inline"
                          placeholder="Niche"
                          aria-label="Niche for script"
                        />
                        <datalist id="script-niche-options">
                          {niches.map((n) => <option key={n.id} value={n.label} />)}
                        </datalist>
                      {renderLangSelect()}
                      <button
                          type="button"
                          className="studio-btn-secondary"
                        onClick={() => void handleGenerateScript()}
                        disabled={scriptGenerating || negativeScriptGenerating}
                      >
                          {scriptGenerating ? "…" : "Suggest script"}
                      </button>
                      <button
                          type="button"
                          className="studio-btn-ghost"
                        onClick={() => void handleGenerateNegativeScript()}
                        disabled={scriptGenerating || negativeScriptGenerating}
                          title="Negative angle"
                      >
                          {negativeScriptGenerating ? "…" : "Negative"}
                      </button>
                    </div>
                    <textarea
                        className="studio-textarea"
                        placeholder="Your script…"
                      value={script}
                        onChange={(e) => setScript(e.target.value)}
                        rows={3}
                        aria-label="Reel script"
                      />
                    <input
                        type="text"
                        className="studio-input"
                        placeholder="Title (optional)"
                      value={title}
                        onChange={(e) => setTitle(e.target.value)}
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
                          onChange={(e) => setSelectedFontName(e.target.value)}
                      style={{ fontFamily: previewFontFamily }}
                          aria-label="Video font"
                    >
                      {fonts.length === 0 ? (
                            <option value="default">Default</option>
                      ) : (
                        fonts.map((font) => (
                          <option
                            key={font.id}
                            value={font.id}
                                style={{
                                  fontFamily:
                                    fontFamilyById[font.id] ??
                                    fallbackPreviewFontFamily,
                                }}
                          >
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
                          title="Animated gradient from script"
                        >
                          Caption
                    </button>
                    <button
                          type="button"
                          className={bgMode === "auto" ? "active" : ""}
                          onClick={() => setBgMode("auto")}
                          title="Random clip"
                        >
                          Auto
                    </button>
                    <button
                          type="button"
                          className={bgMode === "clip" ? "active" : ""}
                          onClick={() => setBgMode("clip")}
                          title="Pick a clip"
                        >
                          Clip
                    </button>
                  </div>
                      {bgMode === "clip" && (
                        <>
                        <select
                            className="studio-select"
                          value={selectedClipName}
                            onChange={(e) => setSelectedClipName(e.target.value)}
                            disabled={
                                clips.length === 0 &&
                                !selectedClipName?.startsWith("order-")
                              }
                            aria-label="Clip"
                          >
                            {clips.length === 0 &&
                            !selectedClipName?.startsWith("order-") ? (
                              <option value="">No clips</option>
                            ) : (
                              <>
                                {selectedClipName?.startsWith("order-") &&
                                  !clips.some((c) => c.name === selectedClipName) && (
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
                              aria-label="Your video's sound"
                            >
                              <label className="studio-check">
                                <input
                                  type="radio"
                                  name="studioClipAudio"
                                  value=""
                                  checked={
                                    !studioUseClipAudio && !studioUseClipAudioWithNarrator
                                  }
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
                                  value="no_narrator"
                                  checked={
                                    studioUseClipAudio &&
                                    !studioUseClipAudioWithNarrator
                                  }
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
                                    <span className="studio-check-hint">
                                      {" "}
                                      — transcript pending
                                    </span>
                                  )}
                                </span>
                              </label>
                              <label className="studio-check">
                                <input
                                  type="radio"
                                  name="studioClipAudio"
                                  value="with_narrator"
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
                                  Use clip audio and add a narrator
                                  {!studioTranscriptReady && (
                                    <span className="studio-check-hint">
                                      {" "}
                                      — transcript pending
                                    </span>
                                  )}
                                </span>
                              </label>
                            </div>
                          )}
                    </>
                  )}
                      <div className="studio-upload">
                    <input
                          type="file"
                          accept=".mp4,.mov,.mkv,.webm,.avi"
                      multiple
                          onChange={(e) => setSelectedFiles(e.target.files)}
                          id="studio-upload-input"
                    />
                        <label htmlFor="studio-upload-input" className="studio-upload-label">
                          Add video
                        </label>
                    <button
                          type="button"
                      onClick={() => void handleUpload()}
                      disabled={isUploading}
                    >
                          {isUploading ? "…" : "Upload"}
                    </button>
                  </div>
                </section>

                    <section className="studio-block">
                      <label className="studio-label">Voice</label>
                      <div className="studio-pills">
                    <button
                          type="button"
                          className={voiceEngine === "piper" ? "active" : ""}
                      onClick={() => {
                            setVoiceEngine("piper");
                            const installed = piperCatalog.find((v) => v.installed);
                            setSelectedVoiceId(installed?.id ?? piperCatalog[0]?.id ?? "");
                      }}
                    >
                      Piper
                    </button>
                    <button
                          type="button"
                          className={voiceEngine === "edge" ? "active" : ""}
                      onClick={() => {
                            setVoiceEngine("edge");
                            setSelectedVoiceId(edgeVoices[0]?.id ?? "");
                      }}
                    >
                      Neural
                    </button>
                    <button
                          type="button"
                          className={voiceEngine === "pyttsx3" ? "active" : ""}
                      onClick={() => {
                            setVoiceEngine("pyttsx3");
                            setSelectedVoiceId(pyttsx3Voices[0]?.id ?? "");
                      }}
                    >
                      Windows
                    </button>
                  </div>
                    <select
                        className="studio-select"
                      value={selectedVoiceId}
                        onChange={(e) => setSelectedVoiceId(e.target.value)}
                        aria-label="Narrator"
                    >
                          {voiceEngine === "pyttsx3"
                        ? pyttsx3Voices.map((voice) => (
                                <option
                                  key={voice.id || voice.name}
                                  value={voice.id}
                                >
                              {voice.name || voice.id}
                            </option>
                          ))
                            : voiceEngine === "edge"
                          ? edgeVoices.map((voice) => (
                              <option key={voice.id} value={voice.id}>
                                {voice.name}
                              </option>
                            ))
                          : piperCatalog.map((voice) => (
                              <option key={voice.id} value={voice.id}>
                                    {voice.name} ({voice.quality})
                                    {voice.installed ? " • installed" : ""}
                              </option>
                            ))}
                    </select>
                </section>

                    <div className="studio-submit">
                  <button
                        className="studio-generate-btn"
                        type="submit"
                        disabled={
                          isCreating ||
                          (bgMode === "caption"
                            ? false
                            : bgMode === "auto"
                              ? clips.length === 0
                              : !selectedClipName)
                        }
                      >
                        {isCreating ? "…" : "Generate Reel"}
                  </button>
                    </div>
              </form>
            </div>
          </aside>

              <main className="studio-canvas">
                {selectedOrder && (() => {
                  const { frames, pricePesos } = orderFramesAndPrice(selectedOrder.script, selectedOrder);
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
                          {selectedOrder.paymentStatus === "confirmed"
                            ? `₱${pricePesos}`
                            : "—"}
                        </span>
                        <span className="muted small">
                          {frames} frame{frames !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="studio-order-bar-status">
                        <span className="studio-order-bar-status-label">Status</span>
                        <select
                          value={(selectedOrder as Order).orderStatus ?? "pending"}
                          onChange={(e) =>
                            handleSetOrderStatus(
                              selectedOrder.id,
                              e.target.value as OrderStatus,
                            )
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
                        <a
                          href={`${apiBaseUrl}${selectedOrderReels[0]?.videoUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="studio-order-bar-view-btn"
                        >
                          View {selectedOrderReels.length > 1 ? `(${selectedOrderReels.length})` : ""}
                        </a>
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
                      onChange={(e) =>
                        setStudioPreviewSize(e.target.value as StudioPreviewSize)
                      }
                      aria-label="Preview device size"
                    >
                      {STUDIO_PREVIEW_SIZES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
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
                          onChange={(e) => setStudioPreviewMuted(!e.target.checked)}
                          aria-label={studioPreviewMuted ? "Play clip audio" : "Mute clip audio"}
                        />
                        <span className="studio-preview-audio-label">
                          {studioPreviewMuted ? "Sound off" : "Sound on"}
                        </span>
                      </label>
                    )}
                  </div>
                  {(selectedOrder || true) && (
                    <div className="studio-caption-options-row">
                      <label className="studio-preview-size-label">Caption position</label>
                      {selectedOrder ? (
                        <span className="muted small">
                          {selectedOrder.scriptPosition ?? "bottom"}
                        </span>
                      ) : (
                        <select
                          className="studio-preview-size-select"
                          value={studioScriptPosition}
                          onChange={(e) =>
                            setStudioScriptPosition(
                              e.target.value as "top" | "center" | "bottom",
                            )
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
                            onChange={(e) =>
                              setStudioScriptStyle((s) => ({
                                ...s,
                                fontScale: Number(e.target.value),
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
                            onChange={(e) =>
                              setStudioScriptStyle((s) => ({
                                ...s,
                                bgOpacity: Number(e.target.value),
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
                  )}
                  <div
                    className="studio-preview-monitor"
                    data-preview-size={studioPreviewSize}
                  >
                    <div className="studio-preview-inner">
                      {(() => {
                        const currentFrameCaption =
                          studioFrameTexts.length > 0
                            ? (studioFrameTexts[studioPreviewFrameIndex] ?? studioFrameTexts[0])
                            : script.trim()
                              ? script.trim().split(/[.!?]/)[0].trim().slice(0, 60) + "…"
                              : "Your script will appear here";
                        const previewTitle = title.trim() || "Your title here";
                  return (
                          <>
                            {bgMode === "caption" ? (
                              <div className="render-preview-caption-bg" />
                            ) : clipPreviewUrl ? (
                          <video
                                className="render-preview-video"
                                src={`${apiBaseUrl}${clipPreviewUrl}`}
                                muted={studioPreviewMuted}
                            loop
                            autoPlay
                            playsInline
                                onLoadedMetadata={(e) => {
                                  const v = e.currentTarget;
                                  if (v.videoWidth && v.videoHeight) {
                                    setStudioPreviewSize(
                                      studioPreviewSizeFromDimensions(
                                        v.videoWidth,
                                        v.videoHeight,
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
                            <div
                              className="render-preview-title"
                              style={{ fontFamily: previewFontFamily }}
                            >
                          {previewTitle}
                        </div>
                            <div
                              className="render-preview-caption"
                              style={{ fontFamily: previewFontFamily }}
                            >
                              {currentFrameCaption}
                        </div>
                          </>
                        );
                      })()}
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
                    {studioFrameTexts.map((frameText, idx) => (
                      <div
                        key={idx}
                        role="listitem"
                        className={`studio-timeline-frame ${idx === studioPreviewFrameIndex ? "active" : ""}`}
                        onClick={() => setStudioPreviewFrameIndex(idx)}
                      >
                        <span className="studio-timeline-frame-num">{idx + 1}</span>
                        <textarea
                          className="studio-timeline-frame-input"
                          value={frameText}
                          onChange={(e) => {
                            const next = [...studioFrameTexts];
                            next[idx] = e.target.value;
                            setScript(next.join(" "));
                          }}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Frame text"
                          aria-label={`Frame ${idx + 1} caption`}
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

              <div
                className="job-toast-stack"
                aria-live="polite"
                aria-atomic="false"
              >
            {jobs
                  .filter((job) => job.status !== "completed")
              .slice(0, 4)
              .map((job) => (
                <article key={job.id} className={`job-toast ${job.status}`}>
                      <div className="job-toast-head">
                    <strong>{job.id.slice(0, 8)}</strong>
                        <span className={`job-chip ${job.status}`}>
                          {job.status}
                        </span>
                  </div>
                      {job.stage ? (
                        <div className="job-stage">{job.stage}</div>
                      ) : null}
                      {job.status === "failed" ? (
                        <p className="error">
                          {job.error || "Generation failed"}
                        </p>
                      ) : (
                        <div className="job-progress">
                          <div className="job-progress-track">
                            <div
                              className="job-progress-fill"
                              style={{
                                width: `${Math.max(0, Math.min(100, job.progress))}%`,
                              }}
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
          }
        />

      {/* ------------------------------------------------------------------ */}
      {/* OUTPUTS (/outputs)                                                    */}
      {/* ------------------------------------------------------------------ */}
        <Route
          path="/outputs"
          element={
            <div className="outputs-page">
              <section className="panel output-panel">
            <h2>Output Gallery</h2>
                <div className="outputs-toolbar">
                  <p className="muted small">
                {newReels.length} new • {uploadedReels.length} uploaded
              </p>
              <button
                    type="button"
                    className="ghost-btn"
                onClick={() => void handleMarkAllUploaded()}
              >
                Mark existing as uploaded
              </button>
            </div>

            {/* YouTube Shorts */}
                <div className="youtube-upload-panel">
              <h3>YouTube Shorts</h3>
              {!youtubeConfigured ? (
                    <p className="muted small">
                      Configure API env: `YOUTUBE_CLIENT_ID`,
                      `YOUTUBE_CLIENT_SECRET`.
                </p>
              ) : (
                    <div className="youtube-upload-form">
                  {renderAccountDropdown(
                    youtubeAccounts,
                    youtubeAccountId,
                    setYoutubeAccountId,
                        "YouTube",
                  )}
                  {connectedYoutubeAccounts.length > 0 && (
                    <>
                      <label>
                        YouTube title
                        <input
                              type="text"
                          value={youtubeTitle}
                          maxLength={100}
                              onChange={(event) =>
                                setYoutubeTitle(event.target.value)
                              }
                              placeholder="Title for this short"
                        />
                      </label>
                      <label>
                        Description
                        <textarea
                          value={youtubeDescription}
                              onChange={(event) =>
                                setYoutubeDescription(event.target.value)
                              }
                          rows={3}
                              placeholder="Description"
                        />
                      </label>
                      <label>
                        Hashtags / tags (comma-separated)
                        <input
                              type="text"
                          value={youtubeTagsInput}
                              onChange={(event) =>
                                setYoutubeTagsInput(event.target.value)
                              }
                              placeholder="shorts, youtubeshorts, gaming"
                        />
                      </label>
                          <div className="youtube-actions">
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={applyTrendingHashtags}
                            >
                          Use trending hashtags
                        </button>
                        <button
                              type="button"
                          onClick={() => void handleUploadLatestToYoutube()}
                              disabled={
                                !youtubeAccountId ||
                                youtubeUploading ||
                                !latestReel ||
                                latestReelUploadedToYoutube
                              }
                              title={
                                latestReelUploadedToYoutube
                                  ? "Already uploaded to this YouTube account"
                                  : ""
                              }
                            >
                              {youtubeUploading
                                ? "Uploading..."
                                : latestReelUploadedToYoutube
                                  ? "✓ Already uploaded"
                                  : "Upload latest reel"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
                  {youtubeMessage ? (
                    <p className="muted small">{youtubeMessage}</p>
                  ) : null}
            </div>

            {/* Facebook Page */}
                <div className="youtube-upload-panel">
              <h3>Facebook Page</h3>
              {!facebookConfigured ? (
                    <p className="muted small">
                  Configure API env: `FB_APP_ID`, `FB_APP_SECRET`.
                </p>
              ) : (
                    <div className="youtube-upload-form">
                  {renderAccountDropdown(
                    facebookAccounts,
                    facebookAccountId,
                    setFacebookAccountId,
                        "Facebook",
                  )}
                  {connectedFacebookAccounts.length > 0 && (
                    <>
                      <label>
                        Caption
                        <textarea
                          value={facebookCaption}
                              onChange={(event) =>
                                setFacebookCaption(event.target.value)
                              }
                          rows={3}
                          maxLength={2200}
                              placeholder="Caption for this reel"
                        />
                      </label>
                          <div className="caption-suggest-row">
                        {renderNicheSelect()}
                        {renderLangSelect()}
                        <button
                              type="button"
                              className="ghost-btn"
                              onClick={() =>
                                void handleSuggestCaption("facebook")
                              }
                              disabled={
                                captionSuggesting || negativeCaptionSuggesting
                              }
                            >
                              {captionSuggesting &&
                              captionSuggestTarget === "facebook"
                                ? "Generating..."
                                : "✨ Suggest caption"}
                        </button>
                        <button
                              type="button"
                              className="ghost-btn negative-script-btn"
                              onClick={() =>
                                void handleSuggestNegativeCaption("facebook")
                              }
                              disabled={
                                captionSuggesting || negativeCaptionSuggesting
                              }
                              title="Generate a raw, critical caption from the same niche"
                            >
                              {negativeCaptionSuggesting &&
                              negativeCaptionSuggestTarget === "facebook"
                                ? "Generating..."
                                : "🔥 Negative caption"}
                        </button>
                      </div>
                          <div className="youtube-actions">
                        <button
                              type="button"
                              onClick={() =>
                                void handleUploadLatestToFacebook()
                              }
                              disabled={
                                !facebookAccountId ||
                                facebookUploading ||
                                !latestReel ||
                                latestReelUploadedToFacebook
                              }
                              title={
                                latestReelUploadedToFacebook
                                  ? "Already uploaded to this Facebook account"
                                  : ""
                              }
                            >
                              {facebookUploading
                                ? "Uploading..."
                                : latestReelUploadedToFacebook
                                  ? "✓ Already uploaded"
                                  : "Post to Facebook Page"}
                        </button>
                        <button
                              type="button"
                              className="ghost-btn"
                              onClick={() =>
                                void handleShareLatestFacebookPostToOtherPages()
                              }
                              disabled={
                                !facebookAccountId ||
                                facebookSharing ||
                                !facebookLastPostUrl
                              }
                              title={
                                !facebookLastPostUrl
                                  ? "Post first, then share to other pages"
                                  : "Share latest Facebook post to your other managed pages"
                              }
                            >
                              {facebookSharing
                                ? "Sharing..."
                                : "Share to other pages"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
                  {facebookMessage ? (
                    <p className="muted small">{facebookMessage}</p>
                  ) : null}
            </div>

            {/* Instagram Reels */}
                <div className="youtube-upload-panel">
              <h3>Instagram Reels</h3>
              {!facebookConfigured ? (
                    <p className="muted small">
                  Configure API env: `FB_APP_ID`, `FB_APP_SECRET`.
                </p>
              ) : (
                    <div className="youtube-upload-form">
                  {renderAccountDropdown(
                    instagramAccounts,
                    instagramAccountId,
                    setInstagramAccountId,
                        "Instagram",
                  )}
                  {connectedInstagramAccounts.length > 0 && (
                    <>
                      <label>
                        Caption
                        <textarea
                          value={instagramCaption}
                              onChange={(event) =>
                                setInstagramCaption(event.target.value)
                              }
                          rows={3}
                          maxLength={2200}
                              placeholder="Caption for this reel"
                        />
                      </label>
                          <div className="caption-suggest-row">
                        {renderNicheSelect()}
                        {renderLangSelect()}
                        <button
                              type="button"
                              className="ghost-btn"
                              onClick={() =>
                                void handleSuggestCaption("instagram")
                              }
                              disabled={
                                captionSuggesting || negativeCaptionSuggesting
                              }
                            >
                              {captionSuggesting &&
                              captionSuggestTarget === "instagram"
                                ? "Generating..."
                                : "✨ Suggest caption"}
                        </button>
                        <button
                              type="button"
                              className="ghost-btn negative-script-btn"
                              onClick={() =>
                                void handleSuggestNegativeCaption("instagram")
                              }
                              disabled={
                                captionSuggesting || negativeCaptionSuggesting
                              }
                              title="Generate a raw, critical caption from the same niche"
                            >
                              {negativeCaptionSuggesting &&
                              negativeCaptionSuggestTarget === "instagram"
                                ? "Generating..."
                                : "🔥 Negative caption"}
                        </button>
                      </div>
                          <div className="youtube-actions">
                        <button
                              type="button"
                              onClick={() =>
                                void handleUploadLatestToInstagram()
                              }
                              disabled={
                                !instagramAccountId ||
                                instagramUploading ||
                                !latestReel ||
                                latestReelUploadedToInstagram
                              }
                              title={
                                latestReelUploadedToInstagram
                                  ? "Already uploaded to this Instagram account"
                                  : ""
                              }
                            >
                              {instagramUploading
                                ? "Uploading..."
                                : latestReelUploadedToInstagram
                                  ? "✓ Already uploaded"
                                  : "Post to Instagram"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
                  {instagramMessage ? (
                    <p className="muted small">{instagramMessage}</p>
                  ) : null}
            </div>

                {latestJob?.status === "processing" ? (
                  <p className="muted small">
                Current job: {latestJob.progress}%
                    {latestJob.stage ? ` • ${latestJob.stage}` : ""}
              </p>
            ) : null}

                <section className="outputs-section">
              <h3>New Reels</h3>
              {newReels.length === 0 ? (
                    <p className="muted small">No new reels pending upload.</p>
              ) : (
                    <div className="reel-grid">
                  {newReels.map((reel) => {
                        const uploading = reelCardUploading[reel.id];
                        const cardMsg = reelCardMessage[reel.id];
                    // Check which platforms this reel is already uploaded to for the selected accounts
                    const doneOnFb = reel.uploadLog.some(
                          (r) =>
                            r.platform === "facebook" &&
                            (!facebookAccountId ||
                              r.accountId === facebookAccountId),
                        );
                    const doneOnYt = reel.uploadLog.some(
                          (r) =>
                            r.platform === "youtube" &&
                            (!youtubeAccountId ||
                              r.accountId === youtubeAccountId),
                        );
                    const doneOnIg = reel.uploadLog.some(
                          (r) =>
                            r.platform === "instagram" &&
                            (!instagramAccountId ||
                              r.accountId === instagramAccountId),
                        );
                    return (
                          <article key={reel.id} className="reel-card">
                        <h3>{reel.folder}</h3>
                        {reel.nicheLabel && (
                              <p className="reel-card-niche muted small">
                                Niche: {reel.nicheLabel}
                              </p>
                            )}
                            <video
                              controls
                              src={`${apiBaseUrl}${reel.videoUrl}`}
                            />
                            <div className="links">
                              <a
                                href={`${apiBaseUrl}${reel.videoUrl}`}
                                target="_blank"
                              >
                                video
                              </a>
                              <a
                                href={`${apiBaseUrl}${reel.srtUrl}`}
                                target="_blank"
                              >
                                srt
                              </a>
                              <a
                                href={`${apiBaseUrl}${reel.txtUrl}`}
                                target="_blank"
                              >
                                txt
                              </a>
                        </div>
                            <div className="reel-card-upload-row">
                          {connectedFacebookAccounts.length > 0 && (
                            <button
                                  type="button"
                                  className={`ghost-btn reel-upload-btn reel-upload-fb${doneOnFb ? " reel-upload-done" : ""}`}
                                  onClick={() =>
                                    void handleUploadReelTo(reel, "facebook")
                                  }
                              disabled={!!uploading || doneOnFb}
                                  title={
                                    doneOnFb
                                      ? "✓ Already on Facebook"
                                      : "Upload to Facebook Page"
                                  }
                                >
                                  {uploading === "facebook"
                                    ? "⏳"
                                    : doneOnFb
                                      ? "✓"
                                      : "📘"}
                            </button>
                          )}
                          {connectedYoutubeAccounts.length > 0 && (
                            <button
                                  type="button"
                                  className={`ghost-btn reel-upload-btn reel-upload-yt${doneOnYt ? " reel-upload-done" : ""}`}
                                  onClick={() =>
                                    void handleUploadReelTo(reel, "youtube")
                                  }
                              disabled={!!uploading || doneOnYt}
                                  title={
                                    doneOnYt
                                      ? "✓ Already on YouTube"
                                      : "Upload to YouTube Shorts"
                                  }
                                >
                                  {uploading === "youtube"
                                    ? "⏳"
                                    : doneOnYt
                                      ? "✓"
                                      : "▶"}
                            </button>
                          )}
                          {connectedInstagramAccounts.length > 0 && (
                            <button
                                  type="button"
                                  className={`ghost-btn reel-upload-btn reel-upload-ig${doneOnIg ? " reel-upload-done" : ""}`}
                                  onClick={() =>
                                    void handleUploadReelTo(reel, "instagram")
                                  }
                              disabled={!!uploading || doneOnIg}
                                  title={
                                    doneOnIg
                                      ? "✓ Already on Instagram"
                                      : "Upload to Instagram Reels"
                                  }
                                >
                                  {uploading === "instagram"
                                    ? "⏳"
                                    : doneOnIg
                                      ? "✓"
                                      : "📷"}
                            </button>
                          )}
                          <button
                                type="button"
                                className="ghost-btn reel-upload-btn"
                                onClick={() =>
                                  void markReelUploaded(reel.id, true)
                                }
                            disabled={!!uploading}
                                title="Manually mark as uploaded without posting"
                          >
                            ✓
                          </button>
                              <button
                                type="button"
                                className={`ghost-btn reel-upload-btn${reel.showcase ? " reel-showcase-on" : ""}`}
                                onClick={() => openShowcaseModal(reel)}
                                disabled={!!uploading}
                                title={
                                  reel.showcase
                                    ? "Edit showcase title & description"
                                    : "Star for web-orders showcase"
                                }
                              >
                                {reel.showcase ? "★" : "☆"}
                              </button>
                        </div>
                            {reel.showcase && (reel.showcaseTitle || reel.showcaseDescription) && (
                              <p className="muted small reel-card-showcase">
                                {reel.showcaseTitle ?? reel.folder}
                                {reel.showcaseDescription ? ` — ${reel.showcaseDescription}` : ""}
                              </p>
                            )}
                        {cardMsg && (
                              <p className="muted small reel-card-msg">
                                {cardMsg}
                              </p>
                        )}
                      </article>
                        );
                  })}
                </div>
              )}
            </section>

                <section className="outputs-section">
              <h3>Uploaded</h3>
              {uploadedReels.length === 0 ? (
                    <p className="muted small">
                      No uploaded reels flagged yet.
                    </p>
              ) : (
                    <div className="reel-grid">
                  {uploadedReels.map((reel) => (
                        <article key={reel.id} className="reel-card uploaded">
                      <h3>{reel.folder}</h3>
                      {reel.nicheLabel && (
                            <p className="reel-card-niche muted small">
                              Niche: {reel.nicheLabel}
                            </p>
                          )}
                          <p className="muted small">
                            Uploaded{" "}
                            {reel.uploadedAt
                              ? new Date(reel.uploadedAt).toLocaleString()
                              : ""}
                      </p>
                      {/* Per-platform upload badges */}
                      {reel.uploadLog && reel.uploadLog.length > 0 && (
                            <div className="upload-badges">
                          {reel.uploadLog.map((record, idx) => (
                            <a
                              key={idx}
                              href={record.url}
                                  target="_blank"
                                  rel="noreferrer"
                              className={`upload-badge upload-badge-${record.platform}`}
                              title={`Uploaded ${new Date(record.uploadedAt).toLocaleString()}`}
                            >
                                  {record.platform === "youtube"
                                    ? "▶ YouTube"
                                    : record.platform === "facebook"
                                      ? "📘 Facebook"
                                      : "📷 Instagram"}
                            </a>
                          ))}
                        </div>
                      )}
                      {/* Legacy youtube link fallback */}
                          {reel.youtubeUrl &&
                          !reel.uploadLog?.some(
                            (r) => r.platform === "youtube",
                          ) ? (
                            <a
                              href={reel.youtubeUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              open youtube
                            </a>
                      ) : null}
                      <button
                            type="button"
                            className="ghost-btn"
                            onClick={() =>
                              void markReelUploaded(reel.id, false)
                            }
                      >
                        Mark as new
                      </button>
                          <button
                            type="button"
                            className={`ghost-btn reel-upload-btn${reel.showcase ? " reel-showcase-on" : ""}`}
                            onClick={() => openShowcaseModal(reel)}
                            title={
                              reel.showcase
                                ? "Edit showcase title & description"
                                : "Star for web-orders showcase"
                            }
                          >
                            {reel.showcase ? "★ Showcase" : "☆ Add to showcase"}
                          </button>
                          {reel.showcase && (
                            <button
                              type="button"
                              className="ghost-btn small"
                              onClick={() => void handleUnstarShowcase(reel)}
                            >
                              Unstar
                            </button>
                          )}
                          {reel.showcase && (reel.showcaseTitle || reel.showcaseDescription) && (
                            <p className="muted small reel-card-showcase">
                              {reel.showcaseTitle ?? reel.folder}
                              {reel.showcaseDescription ? ` — ${reel.showcaseDescription}` : ""}
                            </p>
                          )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
              <footer className="status">
                {statusMessage || "Ready to create."}
              </footer>
        </div>
          }
        />

      {/* ------------------------------------------------------------------ */}
      {/* SETTINGS (/settings)                                                  */}
      {/* ------------------------------------------------------------------ */}
        <Route
          path="/settings"
          element={
            <div className="settings-page">
              <nav className="settings-tabs" aria-label="Settings sections">
            <button
                  type="button"
                  className={settingsTab === "accounts" ? "active" : ""}
                  onClick={() => setSettingsTab("accounts")}
            >
              Social Accounts
            </button>
            <button
                  type="button"
                  className={settingsTab === "niches" ? "active" : ""}
                  onClick={() => setSettingsTab("niches")}
            >
              Content Niches
            </button>
            <button
                  type="button"
                  className={settingsTab === "pipelines" ? "active" : ""}
                  onClick={() => setSettingsTab("pipelines")}
            >
              Auto Pipelines
            </button>
                <button
                  type="button"
                  className={settingsTab === "fonts" ? "active" : ""}
                  onClick={() => setSettingsTab("fonts")}
                >
                  Fonts
                </button>
                <button
                  type="button"
                  className={settingsTab === "clips" ? "active" : ""}
                  onClick={() => setSettingsTab("clips")}
                >
                  Clips
                </button>
                <button
                  type="button"
                  className={settingsTab === "payment" ? "active" : ""}
                  onClick={() => setSettingsTab("payment")}
                >
                  Payment methods
                </button>
                <button
                  type="button"
                  className={settingsTab === "pricing" ? "active" : ""}
                  onClick={() => setSettingsTab("pricing")}
                >
                  Order pricing
                </button>
                <button
                  type="button"
                  className={settingsTab === "voices" ? "active" : ""}
                  onClick={() => setSettingsTab("voices")}
                >
                  Order voices
                </button>
                <button
                  type="button"
                  className={settingsTab === "danger" ? "active" : ""}
                  onClick={() => setSettingsTab("danger")}
                >
                  Danger zone
                </button>
          </nav>

              <div className="settings-tab-panel">
                {settingsTab === "accounts" && (
                  <section className="panel output-panel">
                <h2>Social Accounts</h2>
                    <p className="muted small">
                      Add and connect your social media accounts. Each account
                      is stored locally in SQLite.
                </p>

                    <div className="youtube-upload-panel">
                  <h3>Add Account</h3>
                      <form
                        onSubmit={handleAddAccount}
                        className="youtube-upload-form"
                      >
                    <label>
                      Platform
                      <select
                        value={newAccountPlatform}
                            onChange={(e) =>
                              setNewAccountPlatform(e.target.value as Platform)
                            }
                          >
                            <option value="youtube">YouTube</option>
                            <option value="facebook">Facebook</option>
                            <option value="instagram">Instagram</option>
                      </select>
                    </label>
                    <label>
                      Label
                      <input
                            type="text"
                        value={newAccountLabel}
                        onChange={(e) => setNewAccountLabel(e.target.value)}
                            placeholder="e.g. Gaming Channel, Main Page"
                        maxLength={120}
                      />
                    </label>
                        <div className="youtube-actions">
                          <button type="submit">Add Account</button>
                    </div>
                  </form>
                      {settingsMessage ? (
                        <p className="muted small">{settingsMessage}</p>
                      ) : null}
                </div>

                    {renderAccountList(
                      youtubeAccounts,
                      "youtube",
                      "YouTube Channels",
                    )}
                    {renderAccountList(
                      facebookAccounts,
                      "facebook",
                      "Facebook Pages",
                    )}
                    {renderAccountList(
                      instagramAccounts,
                      "instagram",
                      "Instagram Accounts",
                    )}
              </section>
            )}

                {settingsTab === "niches" && (
                  <section className="panel output-panel">
                <h2>Content Niches</h2>
                    <p className="muted small">
                      Niches define which RSS feeds to pull trending news from
                      and which keywords to filter for positive headlines. Used
                      when generating scripts and captions.
                    </p>

                    <div className="youtube-upload-panel">
                  <h3>Add Niche</h3>
                      <form
                        onSubmit={(e) => void handleAddNiche(e)}
                        className="youtube-upload-form"
                      >
                    <label>
                      Label
                      <input
                            type="text"
                        value={newNicheLabel}
                        onChange={(e) => setNewNicheLabel(e.target.value)}
                            placeholder="e.g. Crypto, Fitness, Anime"
                        maxLength={80}
                      />
                    </label>
                    <label>
                      Positive keywords (comma-separated)
                      <input
                            type="text"
                        value={newNicheKeywords}
                            onChange={(e) =>
                              setNewNicheKeywords(e.target.value)
                            }
                            placeholder="win,record,launch,amazing,best"
                      />
                    </label>
                    <label>
                      RSS feed URLs (one per line)
                      <textarea
                        value={newNicheFeeds}
                        onChange={(e) => setNewNicheFeeds(e.target.value)}
                        rows={3}
                            placeholder={
                              "https://feeds.example.com/rss\nhttps://another-feed.com/feed"
                            }
                      />
                    </label>
                        <div className="youtube-actions">
                          <button type="submit">Add Niche</button>
                    </div>
                  </form>
                      {nicheMessage ? (
                        <p className="muted small">{nicheMessage}</p>
                      ) : null}
                </div>

                    <div className="settings-platform-section">
                  <h3>Your Niches</h3>
                  {niches.length === 0 ? (
                        <p className="muted small">No niches yet.</p>
                  ) : (
                        <div className="account-list">
                      {niches.map((niche) => (
                            <div
                              key={niche.id}
                              className="account-row niche-row"
                            >
                          {editingNicheId === niche.id ? (
                                <div className="niche-edit-form">
                              <input
                                    type="text"
                                value={editNicheLabel}
                                    onChange={(e) =>
                                      setEditNicheLabel(e.target.value)
                                    }
                                    placeholder="Label"
                              />
                              <input
                                    type="text"
                                value={editNicheKeywords}
                                    onChange={(e) =>
                                      setEditNicheKeywords(e.target.value)
                                    }
                                    placeholder="Keywords (comma-separated)"
                              />
                              <textarea
                                value={editNicheFeeds}
                                    onChange={(e) =>
                                      setEditNicheFeeds(e.target.value)
                                    }
                                rows={2}
                                    placeholder="RSS feed URLs (one per line)"
                              />
                                  <div className="account-row-actions">
                                <button
                                      type="button"
                                      className="ghost-btn"
                                      onClick={() =>
                                        void handleSaveNiche(niche.id)
                                      }
                                >
                                  Save
                                </button>
                                <button
                                      type="button"
                                      className="ghost-btn"
                                  onClick={() => setEditingNicheId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                                  <div className="account-row-info">
                                    <span className="account-label">
                                      {niche.label}
                                    </span>
                                    <span
                                      className="muted small"
                                      style={{ fontSize: "0.72rem" }}
                                    >
                                      {niche.rssFeeds.length} feed
                                      {niche.rssFeeds.length !== 1 ? "s" : ""}{" "}
                                      &bull; {niche.keywords || "no keywords"}
                                </span>
                              </div>
                                  <div className="account-row-actions">
                                <button
                                      type="button"
                                      className="ghost-btn"
                                      style={{
                                        color: "#4ade80",
                                        borderColor: "#4ade80",
                                      }}
                                      onClick={() =>
                                        void handlePostSomethingForNiche(niche)
                                      }
                                  disabled={postingNicheId === niche.id}
                                      title="Run a pipeline that uses this niche to post (reel or image)"
                                >
                                      {postingNicheId === niche.id
                                        ? "⏳ Posting..."
                                        : "Post something"}
                                </button>
                                <button
                                      type="button"
                                      className="ghost-btn"
                                      style={{
                                        color: "#38bdf8",
                                        borderColor: "#38bdf8",
                                      }}
                                      onClick={() =>
                                        void handlePostReelForNiche(niche)
                                      }
                                  disabled={postingReelNicheId === niche.id}
                                      title="Always create and post a video reel for this niche (skips image post)"
                                >
                                      {postingReelNicheId === niche.id
                                        ? "⏳ Posting reel..."
                                        : "Post a reel"}
                                </button>
                                <button
                                      type="button"
                                      className="ghost-btn"
                                  onClick={() => startEditNiche(niche)}
                                >
                                  Edit
                                </button>
                                <button
                                      type="button"
                                      className="ghost-btn danger-btn"
                                      onClick={() =>
                                        void handleDeleteNiche(niche.id)
                                      }
                                >
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

                {settingsTab === "pipelines" && (
                  <section className="panel output-panel">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "0.5rem",
                      }}
                    >
                  <h2 style={{ margin: 0 }}>Auto Pipelines</h2>
                      <div
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          alignItems: "center",
                        }}
                      >
                    <button
                          type="button"
                          className="ghost-btn"
                          style={{ color: "#4ade80", borderColor: "#4ade80" }}
                      onClick={() => void handleRunAll()}
                      disabled={pipelines.length === 0}
                          title="Trigger all pipelines now"
                    >
                      ▶ Run all
                    </button>
                    <button
                          type="button"
                          className="ghost-btn"
                          style={{ color: "#f87171", borderColor: "#f87171" }}
                      onClick={() => void handleStopAll()}
                      disabled={pipelineRunningIds.size === 0}
                          title="Request stop for all running pipelines"
                    >
                      ■ Stop all
                    </button>
                    <button
                          type="button"
                          onClick={() => {
                            setShowNewPipelineForm(true);
                            setEditingPipeline(null);
                          }}
                    >
                      + New pipeline
                    </button>
                  </div>
                </div>
                    <p className="muted small">
                      Each pipeline generates a script from trending news,
                      renders a reel, and posts to Facebook automatically on its
                      own schedule.
                    </p>

                    {pipelineMessage ? (
                      <p className="muted small" style={{ color: "#a3e635" }}>
                        {pipelineMessage}
                      </p>
                    ) : null}

                {showNewPipelineForm && (
                  <PipelineForm
                    pipeline={null}
                    niches={niches}
                    facebookAccounts={facebookAccounts}
                    edgeVoices={edgeVoices}
                    fonts={fonts}
                    isRunning={false}
                        onSave={(data) =>
                          void handleCreatePipeline(
                            data as Pipeline & { label: string },
                          )
                        }
                    onCancel={() => setShowNewPipelineForm(false)}
                  />
                )}

                {pipelines.length === 0 && !showNewPipelineForm ? (
                      <p className="muted small">
                        No pipelines yet. Click "+ New pipeline" to create one.
                      </p>
                ) : (
                      <div className="pipeline-list">
                    {pipelines.map((p) => {
                          const isRunning = pipelineRunningIds.has(p.id);
                      if (editingPipeline?.id === p.id) {
                        return (
                          <PipelineForm
                            key={p.id}
                            pipeline={editingPipeline}
                            niches={niches}
                            facebookAccounts={facebookAccounts}
                            edgeVoices={edgeVoices}
                            fonts={fonts}
                            isRunning={isRunning}
                                onSave={(data) =>
                                  void handleSavePipeline(p.id, data)
                                }
                            onCancel={() => setEditingPipeline(null)}
                          />
                            );
                          }
                          const fbAccount = facebookAccounts.find(
                            (a) => a.id === p.facebookAccountId,
                          );
                          const niche = niches.find((n) => n.id === p.nicheId);
                      return (
                            <div key={p.id} className="pipeline-card">
                              <div className="pipeline-card-header">
                                <div className="pipeline-card-title">
                                  <span
                                    className={`pipeline-dot ${p.enabled ? "enabled" : ""}`}
                                  />
                              <strong>{p.label}</strong>
                            </div>
                                <div className="pipeline-card-actions">
                              <button
                                    type="button"
                                    className="ghost-btn"
                                onClick={() => setEditingPipeline(p)}
                              >
                                Edit
                              </button>
                              <button
                                    type="button"
                                    onClick={() =>
                                      void handleRunPipeline(p.id, p.label)
                                    }
                                disabled={isRunning || !p.facebookAccountId}
                                    title={
                                      !p.facebookAccountId
                                        ? "Select a Facebook account first"
                                        : ""
                                    }
                                  >
                                    {isRunning ? "⏳" : "▶ Run"}
                              </button>
                              <button
                                    type="button"
                                    className="ghost-btn"
                                    style={
                                      isRunning
                                        ? {
                                            color: "#f87171",
                                            borderColor: "#f87171",
                                          }
                                        : undefined
                                    }
                                    onClick={() =>
                                      void handleStopPipeline(p.id, p.label)
                                    }
                                disabled={!isRunning}
                                    title={
                                      isRunning
                                        ? "Request stop for this pipeline"
                                        : "Pipeline is not running"
                                    }
                              >
                                ■ Stop
                              </button>
                              <button
                                    type="button"
                                    className="ghost-btn danger-btn"
                                    onClick={() =>
                                      void handleDeletePipeline(p.id)
                                    }
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                              <div className="pipeline-card-meta">
                            <span>{niche?.label ?? p.nicheId}</span>
                            <span>·</span>
                                <span>
                                  {fbAccount?.label ??
                                    (p.facebookAccountId
                                      ? "account"
                                      : "⚠ no account")}
                                </span>
                            <span>·</span>
                                <span>
                                  every{" "}
                                  {p.intervalHours < 1
                                    ? `${Math.round(p.intervalHours * 60)}min`
                                    : `${p.intervalHours}h`}
                                </span>
                            <span>·</span>
                            <span>voice: {p.voiceName}</span>
                            <span>·</span>
                            <span>font: {p.fontName}</span>
                          </div>
                          {p.lastRunAt && (
                                <div
                                  className="pipeline-status-row"
                                  style={{ marginTop: "0.4rem" }}
                                >
                                  <span className="muted small">
                                    Last run:{" "}
                                    {new Date(p.lastRunAt).toLocaleString()}
                                    {" — "}
                                    <span
                                      className={
                                        p.lastRunStatus === "success"
                                          ? "account-status connected"
                                          : p.lastRunStatus === "failed"
                                            ? "account-status disconnected"
                                            : "muted"
                                      }
                                    >
                                      {isRunning
                                        ? "⏳ running"
                                        : p.lastRunStatus === "success"
                                          ? "✓ success"
                                          : p.lastRunStatus === "failed"
                                            ? "✗ failed"
                                            : (p.lastRunStatus ?? "—")}
                                </span>
                              </span>
                              {p.lastRunError && (
                                    <p
                                      className="muted small"
                                      style={{
                                        color: "#f87171",
                                        marginTop: "0.2rem",
                                      }}
                                    >
                                  {p.lastRunError}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                          );
                    })}
                  </div>
                )}
              </section>
            )}
                {settingsTab === "fonts" && (
                  <section className="panel output-panel">
                    <h2>Fonts</h2>
                    <p className="muted small">
                      Upload .ttf or .otf files. Custom fonts appear in the
                      Studio and pipeline font lists. &quot;System fallback&quot;
                      is always available.
                    </p>
                    <form
                      onSubmit={handleUploadFont}
                      className="youtube-upload-form"
                      style={{ marginBottom: "var(--pad-md)" }}
                    >
                      <label>
                        New font file
                        <input
                          type="file"
                          accept=".ttf,.otf"
                          onChange={(e) =>
                            setFontUploadFile(e.target.files?.[0] ?? null)
                          }
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={!fontUploadFile}
                      >
                        Upload
                      </button>
                    </form>
                    {fontMessage ? (
                      <p className="muted small" style={{ marginBottom: "var(--pad-sm)" }}>
                        {fontMessage}
                      </p>
                    ) : null}
                    <ul className="font-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {fonts
                        .filter((f) => f.source === "custom")
                        .map((f) => (
                          <li
                            key={f.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "var(--gap-sm)",
                              marginBottom: "var(--pad-sm)",
                              flexWrap: "wrap",
                            }}
                          >
                            {editingFontId === f.id ? (
                              <>
                                <input
                                  type="text"
                                  value={editingFontName}
                                  onChange={(e) =>
                                    setEditingFontName(e.target.value)
                                  }
                                  placeholder="Display name"
                                  style={{ width: "12rem" }}
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleUpdateFont(f.id)
                                  }
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="ghost-btn"
                                  onClick={() => {
                                    setEditingFontId(null);
                                    setEditingFontName("");
                                  }}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <span style={{ fontWeight: 600 }}>{f.name}</span>
                                <span className="muted small">{f.filename ?? f.id}</span>
                                <button
                                  type="button"
                                  className="ghost-btn"
                                  onClick={() => {
                                    setEditingFontId(f.id);
                                    setEditingFontName(f.name);
                                  }}
                                >
                                  Edit name
                                </button>
                                <button
                                  type="button"
                                  className="ghost-btn danger-btn"
                                  onClick={() => void handleDeleteFont(f.id)}
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </li>
                        ))}
                    </ul>
                    {fonts.filter((f) => f.source === "custom").length === 0 && (
                      <p className="muted small">
                        No custom fonts yet. Upload a .ttf or .otf file above.
                      </p>
                    )}
                  </section>
                )}
                {settingsTab === "clips" && (
                  <section className="panel output-panel">
                    <h2>Clips</h2>
                    <p className="muted small">
                      Game clips are in-house reel videos used for Studio and
                      orders. Order clips are custom videos uploaded from the
                      order site for customer orders.
                    </p>
                    {clipMessage ? (
                      <p className="muted small" style={{ marginBottom: "var(--pad-sm)" }}>
                        {clipMessage}
                      </p>
                    ) : null}

                    <h3 style={{ marginTop: "var(--pad-md)" }}>Game clips (in-house)</h3>
                    <p className="muted small">
                      Used for personal generation and can be offered in the order catalog.
                    </p>
                    <form
                      onSubmit={handleUploadGameClip}
                      className="youtube-upload-form"
                      style={{ marginBottom: "var(--pad-sm)" }}
                    >
                      <label>
                        New game clip
                        <input
                          type="file"
                          accept=".mp4,.mov,.mkv,.webm,.avi"
                          onChange={(e) =>
                            setGameClipUploadFile(e.target.files?.[0] ?? null)
                          }
                        />
                      </label>
                      <button type="submit" disabled={!gameClipUploadFile}>
                        Upload
                      </button>
                    </form>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {gameClips.map((c) => (
                        <li
                          key={c.name}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "var(--gap-sm)",
                            marginBottom: "var(--pad-sm)",
                            flexWrap: "wrap",
                          }}
                        >
                          {editingClipId === c.name && editingClipType === "game" ? (
                            <>
                              <input
                                type="text"
                                value={editingClipName}
                                onChange={(e) => setEditingClipName(e.target.value)}
                                placeholder="Display name"
                                style={{ width: "12rem" }}
                              />
                              <button
                                type="button"
                                onClick={() => void handleUpdateClip("game", c.name)}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="ghost-btn"
                                onClick={() => {
                                  setEditingClipId(null);
                                  setEditingClipName("");
                                }}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <span style={{ fontWeight: 600 }}>
                                {c.displayName ?? c.name}
                              </span>
                              <span className="muted small">{c.name}</span>
                              <button
                                type="button"
                                className="ghost-btn"
                                onClick={() => {
                                  setEditingClipId(c.name);
                                  setEditingClipName(c.displayName ?? c.name);
                                  setEditingClipType("game");
                                }}
                              >
                                Edit name
                              </button>
                              <button
                                type="button"
                                className="ghost-btn danger-btn"
                                onClick={() => void handleDeleteClip("game", c.name)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                    {gameClips.length === 0 && (
                      <p className="muted small">No game clips yet.</p>
                    )}

                    <h3 style={{ marginTop: "var(--pad-lg)" }}>Order clips (customer uploads)</h3>
                    <p className="muted small">
                      Videos uploaded from the order site for their orders.
                    </p>
                    <form
                      onSubmit={handleUploadOrderClip}
                      className="youtube-upload-form"
                      style={{ marginBottom: "var(--pad-sm)" }}
                    >
                      <label>
                        New order clip
                        <input
                          type="file"
                          accept=".mp4,.mov,.mkv,.webm,.avi"
                          onChange={(e) =>
                            setOrderClipUploadFile(e.target.files?.[0] ?? null)
                          }
                        />
                      </label>
                      <button type="submit" disabled={!orderClipUploadFile}>
                        Upload
                      </button>
                    </form>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {orderClips.map((c) => (
                        <li
                          key={c.name}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "var(--gap-sm)",
                            marginBottom: "var(--pad-sm)",
                            flexWrap: "wrap",
                          }}
                        >
                          {editingClipId === c.name && editingClipType === "order" ? (
                            <>
                              <input
                                type="text"
                                value={editingClipName}
                                onChange={(e) => setEditingClipName(e.target.value)}
                                placeholder="Display name"
                                style={{ width: "12rem" }}
                              />
                              <button
                                type="button"
                                onClick={() => void handleUpdateClip("order", c.name)}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="ghost-btn"
                                onClick={() => {
                                  setEditingClipId(null);
                                  setEditingClipName("");
                                }}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <span style={{ fontWeight: 600 }}>
                                {c.displayName ?? c.name}
                              </span>
                              <span className="muted small">{c.name}</span>
                              <button
                                type="button"
                                className="ghost-btn"
                                onClick={() => {
                                  setEditingClipId(c.name);
                                  setEditingClipName(c.displayName ?? c.name);
                                  setEditingClipType("order");
                                }}
                              >
                                Edit name
                              </button>
                              <button
                                type="button"
                                className="ghost-btn danger-btn"
                                onClick={() => void handleDeleteClip("order", c.name)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                    {orderClips.length === 0 && (
                      <p className="muted small">No order clips yet.</p>
                    )}
                  </section>
                )}

                {settingsTab === "payment" && (
                  <section className="panel output-panel">
                    <h2>Payment methods</h2>
                    <p className="muted small">
                      Choose which payment methods to show at checkout on the order site.
                      At least one must be enabled (e.g. GCash). Customers will only see
                      the options you enable here.
                    </p>
                    {paymentMethodsMessage ? (
                      <p className="muted small" style={{ marginBottom: "var(--pad-sm)" }}>
                        {paymentMethodsMessage}
                      </p>
                    ) : null}
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--pad-sm)", marginTop: "var(--pad-md)" }}>
                      {paymentMethodOptions.map((opt) => (
                        <label
                          key={opt.id}
                          style={{ display: "flex", alignItems: "center", gap: "var(--gap-sm)", cursor: "pointer" }}
                        >
                          <input
                            type="checkbox"
                            checked={paymentMethodsEnabled.includes(opt.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPaymentMethodsEnabled((prev) => [...prev, opt.id]);
                              } else {
                                setPaymentMethodsEnabled((prev) => prev.filter((id) => id !== opt.id));
                              }
                            }}
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
          </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ marginTop: "var(--pad-md)" }}
                      disabled={paymentMethodsSaving || paymentMethodsEnabled.length === 0}
                      onClick={async () => {
                        if (paymentMethodsEnabled.length === 0) return;
                        setPaymentMethodsSaving(true);
                        setPaymentMethodsMessage("");
                        try {
                          const res = await fetch(`${apiBaseUrl}/api/settings/payment-methods`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ enabled: paymentMethodsEnabled }),
                          });
                          if (res.ok) {
                            setPaymentMethodsMessage("Saved. Checkout will show the selected methods.");
                          } else {
                            setPaymentMethodsMessage("Failed to save.");
                          }
                        } catch {
                          setPaymentMethodsMessage("Failed to save.");
                        } finally {
                          setPaymentMethodsSaving(false);
                        }
                      }}
                    >
                      {paymentMethodsSaving ? "Saving…" : "Save payment methods"}
                    </button>
                  </section>
                )}

                {settingsTab === "pricing" && (
                  <section className="panel output-panel">
                    <h2>Order pricing</h2>
                    <p className="muted small">
                      Price per frame (₱) for each sound option. Used by the web-orders app and for order totals.
                    </p>
                    <div
                      className="panel compact"
                      style={{
                        marginTop: "var(--pad-sm)",
                        padding: "var(--pad-md)",
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: "var(--gap-md)",
                      }}
                    >
                      <label className="small" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        Words per frame
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={orderPricingEdit.wordsPerFrame}
                          onChange={(e) =>
                            setOrderPricingEdit((prev) => ({
                              ...prev,
                              wordsPerFrame: e.target.value,
                            }))
                          }
                          style={{ width: "4rem", padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
                        />
                      </label>
                      <label className="small" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }} title="Only a voice (no sound from my video)">
                        Default (TTS only) ₱
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={orderPricingEdit.pricePerFramePesos}
                          onChange={(e) =>
                            setOrderPricingEdit((prev) => ({
                              ...prev,
                              pricePerFramePesos: e.target.value,
                            }))
                          }
                          style={{ width: "4rem", padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
                        />
                      </label>
                      <label className="small" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }} title="Only my video's sound (no extra voice)">
                        Clip only ₱
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={orderPricingEdit.clipOnly}
                          onChange={(e) =>
                            setOrderPricingEdit((prev) => ({
                              ...prev,
                              clipOnly: e.target.value,
                            }))
                          }
                          style={{ width: "4rem", padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
                        />
                      </label>
                      <label className="small" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }} title="My video's sound + a voice reading my words">
                        Clip + narrator ₱
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={orderPricingEdit.clipAndNarrator}
                          onChange={(e) =>
                            setOrderPricingEdit((prev) => ({
                              ...prev,
                              clipAndNarrator: e.target.value,
                            }))
                          }
                          style={{ width: "4rem", padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn-secondary small"
                        disabled={orderPricingSaving}
                        onClick={handleSaveOrderPricing}
                      >
                        {orderPricingSaving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </section>
                )}

                {settingsTab === "voices" && (
                  <section className="panel output-panel">
                    <h2>Order voices</h2>
                    <p className="muted small">
                      TTS voices shown in the web-orders app. Disable voices to hide them from the order form.
                    </p>
                    <div className="panel compact" style={{ marginTop: "var(--pad-sm)", overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--color-border)" }}>Voice</th>
                            <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--color-border)" }}>Country</th>
                            <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--color-border)" }}>Language</th>
                            <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--color-border)" }}>Gender</th>
                            <th style={{ textAlign: "center", padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--color-border)" }}>Enabled</th>
                          </tr>
                        </thead>
                        <tbody>
                          {settingsVoices.map((v) => (
                            <tr key={v.id}>
                              <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--color-border)" }}>
                                <span style={{ marginRight: "0.5rem" }}>{localeToFlag(v.locale)}</span>
                                <strong>{v.name}</strong>
                                <span className="muted small" style={{ marginLeft: "0.35rem" }}>{v.id}</span>
                              </td>
                              <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--color-border)" }}>{v.country}</td>
                              <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--color-border)" }}>{v.language}</td>
                              <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--color-border)" }}>{v.gender}</td>
                              <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--color-border)", textAlign: "center" }}>
                                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", cursor: "pointer" }}>
                                  <input
                                    type="checkbox"
                                    checked={v.enabled}
                                    disabled={settingsVoicesTogglingId === v.id}
                                    onChange={() => handleToggleVoiceEnabled(v.id, !v.enabled)}
                                  />
                                  {v.enabled ? "Yes" : "No"}
                                </label>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {settingsVoices.length === 0 && (
                        <p className="muted small" style={{ padding: "1rem" }}>Loading voices…</p>
                      )}
                    </div>
                  </section>
                )}

                {settingsTab === "danger" && (
                  <section
                    className="panel output-panel"
                    style={{
                      borderColor: "var(--danger, #dc2626)",
                      borderWidth: 1,
                      borderStyle: "solid",
                    }}
                  >
                    <h2 style={{ color: "var(--danger, #dc2626)" }}>Danger zone</h2>
                    <p className="muted small">
                      Permanently delete all orders, all order-generated videos
                      (reels), and all customer-uploaded order clips. This cannot be
                      undone.
                    </p>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={deleteAllOrdersInProgress}
                      onClick={() => void handleDeleteAllOrdersAndRelated()}
                      style={{
                        background: "var(--danger, #dc2626)",
                        color: "#fff",
                        border: "none",
                      }}
                    >
                      {deleteAllOrdersInProgress
                        ? "Deleting…"
                        : "Delete all orders and order-related data"}
                    </button>
                  </section>
                )}
        </div>
            </div>
          }
        />

        {/* ------------------------------------------------------------------ */}
        {/* ORDER OUTPUT (/orders/:orderId/output) — reels generated for an order */}
        {/* ------------------------------------------------------------------ */}
        <Route
          path="/orders/:orderId/output"
          element={
            <OrderOutputPage
              orders={orders}
              reels={reels}
              navigate={navigate}
              apiBaseUrl={apiBaseUrl}
              apiVpsBaseUrl={apiVpsBaseUrl}
              onDeleteOrder={async (id) => {
                setOrderDeletingId(id);
                try {
                  const res = await fetch(`${apiBaseUrl}/api/orders/${encodeURIComponent(id)}`, {
                    method: "DELETE",
                  });
                  if (!res.ok) throw new Error("Delete failed");
                  await Promise.all([loadOrders(), loadReels()]);
                  setSelectedOrder((prev) => (prev?.id === id ? null : prev));
                  navigate("/orders");
                } finally {
                  setOrderDeletingId(null);
                }
              }}
              orderDeletingId={orderDeletingId}
            />
          }
        />
        {/* ------------------------------------------------------------------ */}
        {/* ORDERS (/orders) — job requests from customers                            */}
        {/* ------------------------------------------------------------------ */}
        <Route
          path="/orders"
          element={
            <div className="outputs-page" style={{ padding: "var(--pad-md)" }}>
              <section className="panel output-panel">
                <h2>Order requests</h2>
                <p className="muted small">
                  Customer orders from the order site. Click &quot;Open in
                  Studio&quot; to load an order into the Control Room.
                </p>
                <div
                  className="orders-filters"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "var(--gap-sm)",
                    alignItems: "center",
                    marginBottom: "var(--pad-md)",
                  }}
                >
                  <label
                    className="small"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                    }}
                  >
                    Status
                    <select
                      value={ordersFilterStatus}
                      onChange={(e) => setOrdersFilterStatus(e.target.value)}
                      style={{ padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}
                    >
                      <option value="">All</option>
                      <option value="pending">Pending</option>
                      <option value="accepted">Accepted</option>
                      <option value="declined">Declined</option>
                      <option value="processing">Processing</option>
                      <option value="ready_for_sending">Ready for sending</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>
                  <label
                    className="small"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                    }}
                  >
                    Payment
                    <select
                      value={ordersFilterPayment}
                      onChange={(e) => setOrdersFilterPayment(e.target.value)}
                      style={{ padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}
                    >
                      <option value="">All</option>
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                    </select>
                  </label>
                  <label
                    className="small"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                    }}
                  >
                    Reference
                    <input
                      type="text"
                      placeholder="Order ID or payment ref"
                      value={ordersFilterReference}
                      onChange={(e) => setOrdersFilterReference(e.target.value)}
                      style={{
                        padding: "0.35rem 0.6rem",
                        fontSize: "0.85rem",
                        minWidth: "140px",
                      }}
                    />
                  </label>
                  <label
                    className="small"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                    }}
                  >
                    Bank
                    <select
                      value={ordersFilterBank}
                      onChange={(e) => setOrdersFilterBank(e.target.value)}
                      style={{ padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}
                    >
                      <option value="">All</option>
                      <option value="BDO">BDO</option>
                      <option value="BPI">BPI</option>
                      <option value="GCASH">GCash</option>
                    </select>
                  </label>
                  <label
                    className="small"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                    }}
                  >
                    From
                    <input
                      type="date"
                      value={ordersFilterDateStart}
                      onChange={(e) =>
                        setOrdersFilterDateStart(e.target.value)
                      }
                      style={{ padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}
                    />
                  </label>
                  <label
                    className="small"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                    }}
                  >
                    To
                    <input
                      type="date"
                      value={ordersFilterDateEnd}
                      onChange={(e) =>
                        setOrdersFilterDateEnd(e.target.value)
                      }
                      style={{ padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}
                    />
                  </label>
                  {(ordersFilterStatus ||
                    ordersFilterPayment ||
                    ordersFilterReference.trim() ||
                    ordersFilterBank ||
                    ordersFilterDateStart !== `${thisYear}-01-01` ||
                    ordersFilterDateEnd !== `${thisYear}-12-31`) && (
                    <button
                      type="button"
                      className="btn-secondary small"
                      onClick={() => {
                        setOrdersFilterStatus("");
                        setOrdersFilterPayment("");
                        setOrdersFilterReference("");
                        setOrdersFilterBank("");
                        setOrdersFilterDateStart(`${thisYear}-01-01`);
                        setOrdersFilterDateEnd(`${thisYear}-12-31`);
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
                <p className="small muted" style={{ marginBottom: "var(--pad-sm)" }}>
                  {ordersFilterDateStart} → {ordersFilterDateEnd}
                  {" · "}
                  <strong>{ordersBreakdown.total.count} orders</strong>
                  {" · "}
                  ₱{ordersBreakdown.total.amount.toLocaleString()}
                </p>
                {orders.length === 0 ? (
                  <p className="muted small">No orders yet.</p>
                ) : filteredOrders.length === 0 ? (
                  <p className="muted small">
                    No orders match the current filters.
                  </p>
                ) : (
                  <div className="orders-kanban">
                    {KANBAN_COLUMNS.map((col) => (
                      <div
                        key={col.id}
                        className={`orders-kanban-column${kanbanDropTarget === col.id ? " drop-target" : ""}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          setKanbanDropTarget(col.id);
                        }}
                        onDragLeave={() => setKanbanDropTarget(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          const orderId = e.dataTransfer.getData("text/plain");
                          if (orderId) handleSetOrderStatus(orderId, col.id);
                          setKanbanDropTarget(null);
                          setKanbanDragOrderId(null);
                        }}
                      >
                        <div className="orders-kanban-column-head">
                          <span className="orders-kanban-column-title">{col.label}</span>
                          <span className="orders-kanban-column-count">{ordersByStatus[col.id].length}</span>
                        </div>
                        <div className="orders-kanban-column-cards">
                          {ordersByStatus[col.id].map((order) => {
                            const status = (order as Order).orderStatus ?? "pending";
                            const { frames, pricePesos } = orderFramesAndPrice(order.script, order);
                            const orderReels = reels.filter((r) => r.orderId === order.id);
                            const transcriptInfo = order.clipName ? orderClipTranscripts[order.clipName] : null;
                            const transcriptReady = transcriptInfo?.status === "completed";
                            const useClipAudio = orderUseClipAudio[order.id] ?? order.useClipAudio ?? false;
                            const useClipAudioWithNarrator =
                              orderUseClipAudioWithNarrator[order.id] ?? order.useClipAudioWithNarrator ?? false;
                            const clipAudioBlocked =
                              Boolean(order.clipName) &&
                              (useClipAudio || useClipAudioWithNarrator) &&
                              !transcriptReady;
                            const canAccept = status === "pending";
                            const canDecline = status === "pending" || status === "accepted";
                            const canMarkProcessing = status === "accepted" || status === "pending";
                            const canMarkReady = status === "processing";
                            const canClose = status === "ready_for_sending";
                            return (
                              <div
                                key={order.id}
                                className={`orders-kanban-card${kanbanDragOrderId === order.id ? " dragging" : ""}`}
                                draggable
                                onDragStart={(e) => {
                                  const target = e.target as HTMLElement;
                                  if (target.closest("button, input, select, a[href]")) return;
                                  e.dataTransfer.setData("text/plain", order.id);
                                  e.dataTransfer.effectAllowed = "move";
                                  setKanbanDragOrderId(order.id);
                                }}
                                onDragEnd={() => {
                                  setKanbanDragOrderId(null);
                                  setKanbanDropTarget(null);
                                }}
                              >
                                <div className="orders-kanban-card-body">
                                  <div className="orders-kanban-card-header">
                                    <span className="orders-kanban-card-customer-label">Customer</span>
                                    <span className="order-status-badge" data-status={status}>
                                      {status === "ready_for_sending" ? "Ready" : status}
                                    </span>
                                  </div>
                                  <div className="orders-kanban-card-customer-info">
                                    <span className="orders-kanban-card-customer-name">{order.customerName}</span>
                                    <span className="orders-kanban-card-customer-email muted small">{order.customerEmail}</span>
                                    {order.deliveryAddress?.trim() && (
                                      <span className="orders-kanban-card-customer-delivery muted small">
                                        Delivery: {order.deliveryAddress.trim()}
                                      </span>
                                    )}
                                    <span className="orders-kanban-card-customer-size muted small">
                                      Screen size: {orderOutputSizeLabel(order.outputSize)}
                                    </span>
                                  </div>
                                  <p className="orders-kanban-card-summary">
                                    {order.script.length > 45 ? `${order.script.slice(0, 45)}…` : order.script}
                                    <span className="orders-kanban-card-price">{frames} frame{frames !== 1 ? "s" : ""} · ₱{pricePesos}</span>
                                  </p>
                                  <p className="orders-kanban-card-meta muted small">
                                    {order.paymentStatus === "confirmed"
                                      ? orderPaymentLine(order)
                                      : "Payment pending"}
                                    {order.clipName && (
                                      <> · Transcript: {transcriptInfo?.status ?? "pending"}</>
                                    )}
                                    {orderReels.length > 0 && (
                                      <> · {orderReels.length} video{orderReels.length !== 1 ? "s" : ""}</>
                                    )}
                                  </p>
                                  {order.clipName && (
                                    <div
                                      className="orders-kanban-card-clip muted small"
                                      role="group"
                                      aria-label="Your video's sound"
                                    >
                                      <label className="orders-clip-audio-option">
                                        <input
                                          type="radio"
                                          name={`clipAudio-${order.id}`}
                                          value=""
                                          checked={
                                            !useClipAudio &&
                                            !useClipAudioWithNarrator
                                          }
                                          onChange={() => {
                                            setOrderUseClipAudio((prev) => ({
                                              ...prev,
                                              [order.id]: false,
                                            }));
                                            setOrderUseClipAudioWithNarrator(
                                              (prev) => ({
                                                ...prev,
                                                [order.id]: false,
                                              }),
                                            );
                                          }}
                                        />
                                        <span>TTS narrator only (no clip audio)</span>
                                      </label>
                                      <label className="orders-clip-audio-option">
                                        <input
                                          type="radio"
                                          name={`clipAudio-${order.id}`}
                                          value="no_narrator"
                                          checked={
                                            useClipAudio &&
                                            !useClipAudioWithNarrator
                                          }
                                          onChange={() => {
                                            setOrderUseClipAudio((prev) => ({
                                              ...prev,
                                              [order.id]: true,
                                            }));
                                            setOrderUseClipAudioWithNarrator(
                                              (prev) => ({
                                                ...prev,
                                                [order.id]: false,
                                              }),
                                            );
                                          }}
                                        />
                                        <span>Use clip audio (no narrator)</span>
                                      </label>
                                      <label className="orders-clip-audio-option">
                                        <input
                                          type="radio"
                                          name={`clipAudio-${order.id}`}
                                          value="with_narrator"
                                          checked={useClipAudioWithNarrator}
                                          onChange={() => {
                                            setOrderUseClipAudio((prev) => ({
                                              ...prev,
                                              [order.id]: true,
                                            }));
                                            setOrderUseClipAudioWithNarrator(
                                              (prev) => ({
                                                ...prev,
                                                [order.id]: true,
                                              }),
                                            );
                                          }}
                                        />
                                        <span>Use clip audio and add a narrator</span>
                                      </label>
                                    </div>
                                  )}
                                </div>
                                <div className="orders-kanban-card-actions">
                                  <div className="orders-kanban-card-actions-row">
                                    {orderReels.length > 0 && (
                                      <button
                                        type="button"
                                        className="btn-secondary orders-kanban-btn"
                                        onClick={() => navigate(`/orders/${order.id}/output`)}
                                      >
                                        View output{orderReels.length > 1 ? ` (${orderReels.length})` : ""}
                                      </button>
                                    )}
                                    {(status === "pending" || processingOrders[order.id]) && (
                                      <button
                                        type="button"
                                        className="orders-kanban-btn orders-kanban-btn-process"
                                        onClick={() => handleToggleOrderProcessing(order)}
                                        disabled={clipAudioBlocked}
                                      >
                                        {processingOrders[order.id] ? "Cancel process" : "Process this video"}
                                      </button>
                                    )}
                                    {clipAudioBlocked && (
                                      <span className="muted small">Transcript not ready</span>
                                    )}
                                  </div>
                                  <div className="orders-kanban-card-actions-row orders-kanban-approval">
                                    {canAccept && (
                                      <button
                                        type="button"
                                        className="btn-secondary orders-kanban-btn orders-kanban-btn-accept"
                                        onClick={() => handleSetOrderStatus(order.id, "accepted")}
                                      >
                                        Accept
                                      </button>
                                    )}
                                    {canDecline && (
                                      <button
                                        type="button"
                                        className="btn-secondary orders-kanban-btn orders-kanban-btn-decline"
                                        onClick={() => handleSetOrderStatus(order.id, "declined")}
                                      >
                                        Decline
                                      </button>
                                    )}
                                    {canMarkProcessing && (
                                      <button
                                        type="button"
                                        className="btn-secondary orders-kanban-btn"
                                        onClick={() => handleSetOrderStatus(order.id, "processing")}
                                      >
                                        Mark processing
                                      </button>
                                    )}
                                    {canMarkReady && (
                                      <button
                                        type="button"
                                        className="btn-secondary orders-kanban-btn"
                                        onClick={() => handleSetOrderStatus(order.id, "ready_for_sending")}
                                      >
                                        Mark ready to send
                                      </button>
                                    )}
                                    {canClose && (
                                      <button
                                        type="button"
                                        className="btn-secondary orders-kanban-btn"
                                        onClick={() => handleSetOrderStatus(order.id, "closed")}
                                      >
                                        Close
                                      </button>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    className="orders-kanban-btn orders-kanban-btn-studio"
                                    onClick={() => navigate(`/?orderId=${order.id}`)}
                                  >
                                    Open in Studio
                                  </button>
                                  <button
                                    type="button"
                                    className="ghost-btn small orders-kanban-btn orders-kanban-btn-delete"
                                    onClick={() => void handleDeleteOrder(order.id)}
                                    disabled={orderDeletingId === order.id}
                                    title="Delete this order and its generated videos"
                                  >
                                    {orderDeletingId === order.id ? "Deleting…" : "Delete"}
                                  </button>
                                </div>
                          </div>
                        );
                      })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          }
        />
      </Routes>

      {/* Showcase (web-orders) edit modal */}
      {showcaseReel && (
        <div
          className="showcase-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="showcase-modal-title"
          onClick={(e) => e.target === e.currentTarget && closeShowcaseModal()}
        >
          <div className="showcase-modal">
            <h2 id="showcase-modal-title">Showcase on web-orders</h2>
            <p className="muted small">
              Title and description appear on the customer-facing showcase page.
            </p>
            <label className="label">
              Title
              <input
                type="text"
                className="field-input"
                value={showcaseTitleInput}
                onChange={(e) => setShowcaseTitleInput(e.target.value)}
                placeholder={showcaseReel.folder}
              />
            </label>
            <label className="label">
              Description
              <textarea
                className="field-input"
                rows={3}
                value={showcaseDescInput}
                onChange={(e) => setShowcaseDescInput(e.target.value)}
                placeholder="Short description of this sample video"
              />
            </label>
            {showcaseMessage && (
              <p className="muted small" style={{ color: "var(--danger)" }}>
                {showcaseMessage}
              </p>
            )}
            <div className="showcase-modal-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={closeShowcaseModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void handleSaveShowcase()}
                disabled={showcaseSaving}
              >
                {showcaseSaving ? "Saving…" : "Save & star for showcase"}
              </button>
    </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
