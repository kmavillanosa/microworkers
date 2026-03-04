import { useEffect, useState, type FormEvent } from "react";
import type {
  FontItem,
  NicheItem,
  Pipeline,
  SocialAccount,
  VoiceItem,
} from "../types";

export { OrderOutputPage } from "./OrderOutputPage";

/**
 * PipelineForm - Form for creating or editing a pipeline
 */
export function PipelineForm({
  pipeline,
  niches,
  facebookAccounts,
  edgeVoices,
  fonts,
  isRunning,
  apiBaseUrl,
  onSave,
  onCancel,
}: {
  pipeline: Pipeline | null;
  niches: NicheItem[];
  facebookAccounts: SocialAccount[];
  edgeVoices: VoiceItem[];
  fonts: FontItem[];
  isRunning: boolean;
  apiBaseUrl: string;
  onSave: (data: Partial<Pipeline> & { label: string }) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(pipeline?.label ?? "New Pipeline");
  const [enabled, setEnabled] = useState(pipeline?.enabled ?? false);
  const [nicheId, setNicheId] = useState(
    pipeline?.nicheId ?? niches[0]?.id ?? ""
  );
  const [facebookAccountId, setFacebookAccountId] = useState(
    pipeline?.facebookAccountId ?? ""
  );
  const [voiceEngine, setVoiceEngine] = useState(
    pipeline?.voiceEngine ?? "edge"
  );
  const [voiceName, setVoiceName] = useState(
    pipeline?.voiceName ?? "en-US-GuyNeural"
  );
  const [fontName, setFontName] = useState(
    pipeline?.fontName ?? "Kidmania Trial Regular.otf"
  );
  const [ollamaModel, setOllamaModel] = useState(
    pipeline?.ollamaModel ?? "llama3"
  );
  const [lang, setLang] = useState<"auto" | "english" | "tagalog" | "taglish">(
    (pipeline?.lang as "auto" | "english" | "tagalog" | "taglish") ?? "auto"
  );
  const [intervalHours, setIntervalHours] = useState(
    pipeline?.intervalHours ?? 0.5
  );
  const [facebookPageIds, setFacebookPageIds] = useState<string[]>(
    pipeline?.facebookPageIds ?? []
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
      `${apiBaseUrl}/api/facebook/pages?accountId=${encodeURIComponent(
        facebookAccountId
      )}`
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
  }, [facebookAccountId, apiBaseUrl]);

  useEffect(() => {
    setFacebookPageIds(pipeline?.facebookPageIds ?? []);
  }, [pipeline?.id, pipeline?.facebookPageIds]);

  function togglePage(pageId: string) {
    setFacebookPageIds((prev) =>
      prev.includes(pageId)
        ? prev.filter((id) => id !== pageId)
        : [...prev, pageId]
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
