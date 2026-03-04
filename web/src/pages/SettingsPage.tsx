import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { PipelineForm } from "../components";
import { useAppStore } from "../stores/useAppStore";

/**
 * Helper to localize flag emoji from locale string
 */
function localeToFlag(locale: string): string {
  const parts = locale.split("-");
  const countryCode = parts[1];
  if (!countryCode) return "🌍";
  return String.fromCodePoint(
    127397 + countryCode.charCodeAt(0),
    127397 + countryCode.charCodeAt(1)
  );
}

const SETTINGS_ROUTE_TABS = [
  "accounts",
  "niches",
  "pipelines",
  "fonts",
  "clips",
  "payment",
  "pricing",
  "voices",
  "danger",
] as const;

type SettingsRouteTab = (typeof SETTINGS_ROUTE_TABS)[number];

function isSettingsRouteTab(value: string): value is SettingsRouteTab {
  return (SETTINGS_ROUTE_TABS as readonly string[]).includes(value);
}

/**
 * SettingsPage - Application configuration and management
 */
export function SettingsPage() {
  const {
    apiBaseUrl,
    settingsTab,
    setSettingsTab,
    allAccounts,
    newAccountPlatform,
    newAccountLabel,
    settingsMessage,
    setNewAccountPlatform,
    setNewAccountLabel,
    handleConnectAccount,
    handleDisconnectAccount,
    handleDeleteAccount,
    niches,
    newNicheLabel,
    newNicheKeywords,
    newNicheFeeds,
    nicheMessage,
    editingNicheId,
    editNicheLabel,
    editNicheKeywords,
    editNicheFeeds,
    postingNicheId,
    postingReelNicheId,
    setNewNicheLabel,
    setNewNicheKeywords,
    setNewNicheFeeds,
    setEditingNicheId,
    setEditNicheLabel,
    setEditNicheKeywords,
    setEditNicheFeeds,
    pipelines,
    showNewPipelineForm,
    editingPipeline,
    pipelineRunningIds,
    pipelineMessage,
    edgeVoices,
    fonts,
    setShowNewPipelineForm,
    setEditingPipeline,
    fontUploadFile,
    fontMessage,
    editingFontId,
    editingFontName,
    setFontUploadFile,
    setEditingFontId,
    setEditingFontName,
    gameClips,
    orderClips,
    gameClipUploadFile,
    orderClipUploadFile,
    clipMessage,
    editingClipId,
    editingClipType,
    editingClipName,
    setGameClipUploadFile,
    setOrderClipUploadFile,
    setEditingClipId,
    setEditingClipType,
    setEditingClipName,
    paymentMethodOptions,
    paymentMethodsEnabled,
    paymentMethodsSaving,
    paymentMethodsMessage,
    setPaymentMethodsEnabled,
    setPaymentMethodsSaving,
    setPaymentMethodsMessage,
    orderPricingEdit,
    orderPricingSaving,
    setOrderPricingEdit,
    handleSaveOrderPricing,
    settingsVoices,
    settingsVoicesTogglingId,
    handleToggleVoiceEnabled,
    deleteAllOrdersInProgress,
    handleDeleteAllOrdersAndRelated,
    handleAddAccount,
    handleAddNiche,
    handleSaveNiche,
    handleDeleteNiche,
    handlePostSomethingForNiche,
    handlePostReelForNiche,
    startEditNiche,
    handleCreatePipeline,
    handleSavePipeline,
    handleDeletePipeline,
    handleRunPipeline,
    handleStopPipeline,
    handleRunAll,
    handleStopAll,
    handleUploadFont,
    handleUpdateFont,
    handleDeleteFont,
    handleUploadGameClip,
    handleUploadOrderClip,
    handleUpdateClip,
    handleDeleteClip,
  } = useAppStore(useShallow((state) => ({
    apiBaseUrl: state.apiBaseUrl,
    settingsTab: state.settingsTab,
    setSettingsTab: state.setSettingsTab,
    allAccounts: state.allAccounts,
    newAccountPlatform: state.newAccountPlatform,
    newAccountLabel: state.newAccountLabel,
    settingsMessage: state.settingsMessage,
    setNewAccountPlatform: state.setNewAccountPlatform,
    setNewAccountLabel: state.setNewAccountLabel,
    handleConnectAccount: state.handleConnectAccount,
    handleDisconnectAccount: state.handleDisconnectAccount,
    handleDeleteAccount: state.handleDeleteAccount,
    niches: state.niches,
    newNicheLabel: state.newNicheLabel,
    newNicheKeywords: state.newNicheKeywords,
    newNicheFeeds: state.newNicheFeeds,
    nicheMessage: state.nicheMessage,
    editingNicheId: state.editingNicheId,
    editNicheLabel: state.editNicheLabel,
    editNicheKeywords: state.editNicheKeywords,
    editNicheFeeds: state.editNicheFeeds,
    postingNicheId: state.postingNicheId,
    postingReelNicheId: state.postingReelNicheId,
    setNewNicheLabel: state.setNewNicheLabel,
    setNewNicheKeywords: state.setNewNicheKeywords,
    setNewNicheFeeds: state.setNewNicheFeeds,
    setEditingNicheId: state.setEditingNicheId,
    setEditNicheLabel: state.setEditNicheLabel,
    setEditNicheKeywords: state.setEditNicheKeywords,
    setEditNicheFeeds: state.setEditNicheFeeds,
    pipelines: state.pipelines,
    showNewPipelineForm: state.showNewPipelineForm,
    editingPipeline: state.editingPipeline,
    pipelineRunningIds: state.pipelineRunningIds,
    pipelineMessage: state.pipelineMessage,
    edgeVoices: state.edgeVoices,
    fonts: state.fonts,
    setShowNewPipelineForm: state.setShowNewPipelineForm,
    setEditingPipeline: state.setEditingPipeline,
    fontUploadFile: state.fontUploadFile,
    fontMessage: state.fontMessage,
    editingFontId: state.editingFontId,
    editingFontName: state.editingFontName,
    setFontUploadFile: state.setFontUploadFile,
    setEditingFontId: state.setEditingFontId,
    setEditingFontName: state.setEditingFontName,
    gameClips: state.gameClips,
    orderClips: state.orderClips,
    gameClipUploadFile: state.gameClipUploadFile,
    orderClipUploadFile: state.orderClipUploadFile,
    clipMessage: state.clipMessage,
    editingClipId: state.editingClipId,
    editingClipType: state.editingClipType,
    editingClipName: state.editingClipName,
    setGameClipUploadFile: state.setGameClipUploadFile,
    setOrderClipUploadFile: state.setOrderClipUploadFile,
    setEditingClipId: state.setEditingClipId,
    setEditingClipType: state.setEditingClipType,
    setEditingClipName: state.setEditingClipName,
    paymentMethodOptions: state.paymentMethodOptions,
    paymentMethodsEnabled: state.paymentMethodsEnabled,
    paymentMethodsSaving: state.paymentMethodsSaving,
    paymentMethodsMessage: state.paymentMethodsMessage,
    setPaymentMethodsEnabled: state.setPaymentMethodsEnabled,
    setPaymentMethodsSaving: state.setPaymentMethodsSaving,
    setPaymentMethodsMessage: state.setPaymentMethodsMessage,
    orderPricingEdit: state.orderPricingEdit,
    orderPricingSaving: state.orderPricingSaving,
    setOrderPricingEdit: state.setOrderPricingEdit,
    handleSaveOrderPricing: state.handleSaveOrderPricing,
    settingsVoices: state.settingsVoices,
    settingsVoicesTogglingId: state.settingsVoicesTogglingId,
    handleToggleVoiceEnabled: state.handleToggleVoiceEnabled,
    deleteAllOrdersInProgress: state.deleteAllOrdersInProgress,
    handleDeleteAllOrdersAndRelated: state.handleDeleteAllOrdersAndRelated,
    handleAddAccount: state.handleAddAccount,
    handleAddNiche: state.handleAddNiche,
    handleSaveNiche: state.handleSaveNiche,
    handleDeleteNiche: state.handleDeleteNiche,
    handlePostSomethingForNiche: state.handlePostSomethingForNiche,
    handlePostReelForNiche: state.handlePostReelForNiche,
    startEditNiche: state.startEditNiche,
    handleCreatePipeline: state.handleCreatePipeline,
    handleSavePipeline: state.handleSavePipeline,
    handleDeletePipeline: state.handleDeletePipeline,
    handleRunPipeline: state.handleRunPipeline,
    handleStopPipeline: state.handleStopPipeline,
    handleRunAll: state.handleRunAll,
    handleStopAll: state.handleStopAll,
    handleUploadFont: state.handleUploadFont,
    handleUpdateFont: state.handleUpdateFont,
    handleDeleteFont: state.handleDeleteFont,
    handleUploadGameClip: state.handleUploadGameClip,
    handleUploadOrderClip: state.handleUploadOrderClip,
    handleUpdateClip: state.handleUpdateClip,
    handleDeleteClip: state.handleDeleteClip,
  })));

  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();
  const routeTab = (tab ?? "").toLowerCase();
  const activeSettingsTab: SettingsRouteTab =
    isSettingsRouteTab(routeTab) ? routeTab : "accounts";

  useEffect(() => {
    if (!isSettingsRouteTab(routeTab)) {
      navigate("/settings/accounts", { replace: true });
      return;
    }
    if (settingsTab !== activeSettingsTab) {
      setSettingsTab(activeSettingsTab);
    }
  }, [activeSettingsTab, navigate, routeTab, setSettingsTab, settingsTab]);

  const youtubeAccounts = useMemo(
    () => allAccounts.filter((account) => account.platform === "youtube"),
    [allAccounts],
  );
  const facebookAccounts = useMemo(
    () => allAccounts.filter((account) => account.platform === "facebook"),
    [allAccounts],
  );
  const instagramAccounts = useMemo(
    () => allAccounts.filter((account) => account.platform === "instagram"),
    [allAccounts],
  );
  /**
   * Helper: Render account list for a platform
   */
  const renderAccountList = (
    accounts: Array<{
      id: string;
      label?: string;
      connected: boolean;
      username?: string;
    }>,
    platform: "youtube" | "facebook" | "instagram",
    title: string
  ) => {
    if (accounts.length === 0) return null;
    return (
      <div className="settings-platform-section">
        <h3>{title}</h3>
        <div className="account-list">
          {accounts.map((account) => (
            <div key={account.id} className="account-row">
              <div className="account-row-info">
                <span className="account-label">
                  {account.label || account.username || account.id}
                </span>
                <span
                  className={`account-status ${account.connected ? "connected" : "disconnected"
                    }`}
                >
                  {account.connected ? "✓ Connected" : "✗ Disconnected"}
                </span>
              </div>
              <div className="account-row-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => void handleConnectAccount(account.id, platform)}
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
      </div>
    );
  };

  return (
    <div className="settings-page">
      <nav className="settings-tabs" aria-label="Settings sections">
        <button
          type="button"
          className={activeSettingsTab === "accounts" ? "active" : ""}
          onClick={() => navigate("/settings/accounts")}
        >
          Social Accounts
        </button>
        <button
          type="button"
          className={activeSettingsTab === "niches" ? "active" : ""}
          onClick={() => navigate("/settings/niches")}
        >
          Content Niches
        </button>
        <button
          type="button"
          className={activeSettingsTab === "pipelines" ? "active" : ""}
          onClick={() => navigate("/settings/pipelines")}
        >
          Auto Pipelines
        </button>
        <button
          type="button"
          className={activeSettingsTab === "fonts" ? "active" : ""}
          onClick={() => navigate("/settings/fonts")}
        >
          Fonts
        </button>
        <button
          type="button"
          className={activeSettingsTab === "clips" ? "active" : ""}
          onClick={() => navigate("/settings/clips")}
        >
          Clips
        </button>
        <button
          type="button"
          className={activeSettingsTab === "payment" ? "active" : ""}
          onClick={() => navigate("/settings/payment")}
        >
          Payment methods
        </button>
        <button
          type="button"
          className={activeSettingsTab === "pricing" ? "active" : ""}
          onClick={() => navigate("/settings/pricing")}
        >
          Order pricing
        </button>
        <button
          type="button"
          className={activeSettingsTab === "voices" ? "active" : ""}
          onClick={() => navigate("/settings/voices")}
        >
          Order voices
        </button>
        <button
          type="button"
          className={activeSettingsTab === "danger" ? "active" : ""}
          onClick={() => navigate("/settings/danger")}
        >
          Danger zone
        </button>
      </nav>

      <div className="settings-tab-panel">
        {/* ACCOUNTS TAB */}
        {activeSettingsTab === "accounts" && (
          <section className="panel output-panel">
            <h2>Social Accounts</h2>
            <p className="muted small">
              Add and connect your social media accounts. Each account is stored
              locally in SQLite.
            </p>

            <div className="youtube-upload-panel">
              <h3>Add Account</h3>
              <form onSubmit={handleAddAccount} className="youtube-upload-form">
                <label>
                  Platform
                  <select
                    value={newAccountPlatform}
                    onChange={(e) =>
                      setNewAccountPlatform(e.target.value as any)
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
              youtubeAccounts as any,
              "youtube",
              "YouTube Channels"
            )}
            {renderAccountList(
              facebookAccounts as any,
              "facebook",
              "Facebook Pages"
            )}
            {renderAccountList(
              instagramAccounts as any,
              "instagram",
              "Instagram Accounts"
            )}
          </section>
        )}

        {/* NICHES TAB */}
        {activeSettingsTab === "niches" && (
          <section className="panel output-panel">
            <h2>Content Niches</h2>
            <p className="muted small">
              Niches define which RSS feeds to pull trending news from and which
              keywords to filter for positive headlines. Used when generating
              scripts and captions.
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
                    onChange={(e) => setNewNicheKeywords(e.target.value)}
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
                    <div key={niche.id} className="account-row niche-row">
                      {editingNicheId === niche.id ? (
                        <div className="niche-edit-form">
                          <input
                            type="text"
                            value={editNicheLabel}
                            onChange={(e) => setEditNicheLabel(e.target.value)}
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
                            onChange={(e) => setEditNicheFeeds(e.target.value)}
                            rows={2}
                            placeholder="RSS feed URLs (one per line)"
                          />
                          <div className="account-row-actions">
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => void handleSaveNiche(niche.id)}
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
                            <span className="account-label">{niche.label}</span>
                            <span
                              className="muted small"
                              style={{ fontSize: "0.72rem" }}
                            >
                              {niche.rssFeeds.length} feed
                              {niche.rssFeeds.length !== 1
                                ? "s"
                                : ""} &bull; {niche.keywords || "no keywords"}
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
                              onClick={() => void handlePostReelForNiche(niche)}
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
                              onClick={() => void handleDeleteNiche(niche.id)}
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

        {/* PIPELINES TAB */}
        {activeSettingsTab === "pipelines" && (
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
              Each pipeline generates a script from trending news, renders a
              reel, and posts to Facebook automatically on its own schedule.
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
                apiBaseUrl={apiBaseUrl}
                onSave={(data) => void handleCreatePipeline(data as any)}
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
                        apiBaseUrl={apiBaseUrl}
                        onSave={(data) => void handleSavePipeline(p.id, data)}
                        onCancel={() => setEditingPipeline(null)}
                      />
                    );
                  }
                  const fbAccount = facebookAccounts.find(
                    (a) => a.id === p.facebookAccountId
                  );
                  const niche = niches.find((n) => n.id === p.nicheId);
                  return (
                    <div key={p.id} className="pipeline-card">
                      <div className="pipeline-card-header">
                        <div className="pipeline-card-title">
                          <span
                            className={`pipeline-dot ${p.enabled ? "enabled" : ""
                              }`}
                          />
                          <strong>{(p as any).label || p.id}</strong>
                        </div>
                        <div className="pipeline-card-actions">
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() => setEditingPipeline(p as any)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleRunPipeline(
                                p.id,
                                (p as any).label || p.id
                              )
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
                              void handleStopPipeline(
                                p.id,
                                (p as any).label || p.id
                              )
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
                            onClick={() => void handleDeletePipeline(p.id)}
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
                            (p.facebookAccountId ? "account" : "⚠ no account")}
                        </span>
                        <span>·</span>
                        <span>
                          every{" "}
                          {p.intervalHours < 1
                            ? `${Math.round(p.intervalHours * 60)}min`
                            : `${p.intervalHours}h`}
                        </span>
                        <span>·</span>
                        <span>voice: {(p as any).voiceName}</span>
                        <span>·</span>
                        <span>font: {(p as any).fontName}</span>
                      </div>
                      {p.lastRunAt && (
                        <div
                          className="pipeline-status-row"
                          style={{ marginTop: "0.4rem" }}
                        >
                          <span className="muted small">
                            Last run: {new Date(p.lastRunAt).toLocaleString()}
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
                                    : p.lastRunStatus ?? "—"}
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

        {/* FONTS TAB */}
        {activeSettingsTab === "fonts" && (
          <section className="panel output-panel">
            <h2>Fonts</h2>
            <p className="muted small">
              Upload .ttf or .otf files. Custom fonts appear in the Studio and
              pipeline font lists. &quot;System fallback&quot; is always
              available.
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
              <button type="submit" disabled={!fontUploadFile}>
                Upload
              </button>
            </form>
            {fontMessage ? (
              <p
                className="muted small"
                style={{ marginBottom: "var(--pad-sm)" }}
              >
                {fontMessage}
              </p>
            ) : null}
            <ul
              className="font-list"
              style={{ listStyle: "none", padding: 0, margin: 0 }}
            >
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
                          onChange={(e) => setEditingFontName(e.target.value)}
                          placeholder="Display name"
                          style={{ width: "12rem" }}
                        />
                        <button
                          type="button"
                          onClick={() => void handleUpdateFont(f.id)}
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
                        <span className="muted small">
                          {f.filename ?? f.id}
                        </span>
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

        {/* CLIPS TAB */}
        {activeSettingsTab === "clips" && (
          <section className="panel output-panel">
            <h2>Clips</h2>
            <p className="muted small">
              Game clips are in-house reel videos used for Studio and orders.
              Order clips are custom videos uploaded from theeorder site for
              customer orders.
            </p>
            {clipMessage ? (
              <p
                className="muted small"
                style={{ marginBottom: "var(--pad-sm)" }}
              >
                {clipMessage}
              </p>
            ) : null}

            <h3 style={{ marginTop: "var(--pad-md)" }}>
              Game clips (in-house)
            </h3>
            <p className="muted small">
              Used for personal generation and can be offered in the order
              catalog.
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

            <h3 style={{ marginTop: "var(--pad-lg)" }}>
              Order clips (customer uploads)
            </h3>
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

        {/* PAYMENT TAB */}
        {activeSettingsTab === "payment" && (
          <section className="panel output-panel">
            <h2>Payment methods</h2>
            <p className="muted small">
              Choose which payment methods to show at checkout on the order
              site. At least one must be enabled (e.g. GCash). Customers will
              only see the options you enable here.
            </p>
            {paymentMethodsMessage ? (
              <p
                className="muted small"
                style={{ marginBottom: "var(--pad-sm)" }}
              >
                {paymentMethodsMessage}
              </p>
            ) : null}
            <div className="settings-payment-methods-list">
              {paymentMethodOptions.map((opt) => (
                <label
                  key={opt.id}
                  className="settings-payment-method-row"
                >
                  <input
                    type="checkbox"
                    className="settings-payment-method-checkbox"
                    checked={paymentMethodsEnabled.includes(opt.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setPaymentMethodsEnabled([
                          ...paymentMethodsEnabled,
                          opt.id,
                        ]);
                      } else {
                        setPaymentMethodsEnabled(
                          paymentMethodsEnabled.filter((id) => id !== opt.id)
                        );
                      }
                    }}
                  />
                  <span className="settings-payment-method-label">
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: "var(--pad-md)" }}
              disabled={
                paymentMethodsSaving || paymentMethodsEnabled.length === 0
              }
              onClick={async () => {
                setPaymentMethodsSaving(true);
                setPaymentMethodsMessage("");
                try {
                  const res = await fetch(
                    `${apiBaseUrl}/api/settings/payment-methods`,
                    {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ enabled: paymentMethodsEnabled }),
                    }
                  );
                  if (res.ok) {
                    setPaymentMethodsMessage(
                      "Saved. Checkout will show the selected methods."
                    );
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

        {/* PRICING TAB */}
        {activeSettingsTab === "pricing" && (
          <section className="panel output-panel">
            <h2>Order pricing</h2>
            <p className="muted small">
              Price per frame (₱) for each sound option. Used by the web-orders
              app and for order totals.
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
              <label
                className="small"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                Words per frame
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={orderPricingEdit.wordsPerFrame}
                  onChange={(e) =>
                    setOrderPricingEdit((prev: any) => ({
                      ...prev,
                      wordsPerFrame: e.target.value,
                    }))
                  }
                  style={{
                    width: "4rem",
                    padding: "0.35rem 0.5rem",
                    fontSize: "0.85rem",
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
                title="Only a voice (no sound from my video)"
              >
                Default (TTS only) ₱
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={orderPricingEdit.pricePerFramePesos}
                  onChange={(e) =>
                    setOrderPricingEdit((prev: any) => ({
                      ...prev,
                      pricePerFramePesos: e.target.value,
                    }))
                  }
                  style={{
                    width: "4rem",
                    padding: "0.35rem 0.5rem",
                    fontSize: "0.85rem",
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
                title="Only my video's sound (no extra voice)"
              >
                Clip only ₱
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={orderPricingEdit.clipOnly}
                  onChange={(e) =>
                    setOrderPricingEdit((prev: any) => ({
                      ...prev,
                      clipOnly: e.target.value,
                    }))
                  }
                  style={{
                    width: "4rem",
                    padding: "0.35rem 0.5rem",
                    fontSize: "0.85rem",
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
                title="My video's sound + a voice reading my words"
              >
                Clip + narrator ₱
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={orderPricingEdit.clipAndNarrator}
                  onChange={(e) =>
                    setOrderPricingEdit((prev: any) => ({
                      ...prev,
                      clipAndNarrator: e.target.value,
                    }))
                  }
                  style={{
                    width: "4rem",
                    padding: "0.35rem 0.5rem",
                    fontSize: "0.85rem",
                  }}
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

        {/* VOICES TAB */}
        {activeSettingsTab === "voices" && (
          <section className="panel output-panel">
            <h2>Order voices</h2>
            <p className="muted small">
              TTS voices shown in the web-orders app. Disable voices to hide
              them from the order form.
            </p>
            <div
              className="panel compact"
              style={{ marginTop: "var(--pad-sm)", overflowX: "auto" }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 520,
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "0.5rem 0.75rem",
                        borderBottom: "1px solid var(--color-border)",
                      }}
                    >
                      Voice
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "0.5rem 0.75rem",
                        borderBottom: "1px solid var(--color-border)",
                      }}
                    >
                      Country
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "0.5rem 0.75rem",
                        borderBottom: "1px solid var(--color-border)",
                      }}
                    >
                      Language
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "0.5rem 0.75rem",
                        borderBottom: "1px solid var(--color-border)",
                      }}
                    >
                      Gender
                    </th>
                    <th
                      style={{
                        textAlign: "center",
                        padding: "0.5rem 0.75rem",
                        borderBottom: "1px solid var(--color-border)",
                      }}
                    >
                      Enabled
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {settingsVoices.map((v) => (
                    <tr key={v.id}>
                      <td
                        style={{
                          padding: "0.5rem 0.75rem",
                          borderBottom: "1px solid var(--color-border)",
                        }}
                      >
                        <span style={{ marginRight: "0.5rem" }}>
                          {localeToFlag(v.locale)}
                        </span>
                        <strong>{v.name}</strong>
                        <span
                          className="muted small"
                          style={{ marginLeft: "0.35rem" }}
                        >
                          {v.id}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "0.5rem 0.75rem",
                          borderBottom: "1px solid var(--color-border)",
                        }}
                      >
                        {v.country}
                      </td>
                      <td
                        style={{
                          padding: "0.5rem 0.75rem",
                          borderBottom: "1px solid var(--color-border)",
                        }}
                      >
                        {v.language}
                      </td>
                      <td
                        style={{
                          padding: "0.5rem 0.75rem",
                          borderBottom: "1px solid var(--color-border)",
                        }}
                      >
                        {v.gender}
                      </td>
                      <td
                        style={{
                          padding: "0.5rem 0.75rem",
                          borderBottom: "1px solid var(--color-border)",
                          textAlign: "center",
                        }}
                      >
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={v.enabled}
                            disabled={settingsVoicesTogglingId === v.id}
                            onChange={() =>
                              handleToggleVoiceEnabled(v.id, !v.enabled)
                            }
                          />
                          {v.enabled ? "Yes" : "No"}
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {settingsVoices.length === 0 && (
                <p className="muted small" style={{ padding: "1rem" }}>
                  Loading voices…
                </p>
              )}
            </div>
          </section>
        )}

        {/* DANGER ZONE TAB */}
        {activeSettingsTab === "danger" && (
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
              Permanently delete all orders, all order-generated videos (reels),
              and all customer-uploaded order clips. This cannot be undone.
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
  );
}
