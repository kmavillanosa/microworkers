import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../stores/useAppStore";

/**
 * Helper: Render account dropdown for social platforms
 */
function renderAccountDropdown(
  accounts: Array<{
    id: string;
    label?: string;
    name?: string;
    email?: string;
  }>,
  selectedId: string | null,
  onChange: (id: string) => void,
  platformLabel: string
) {
  return (
    <label>
      {platformLabel} account
      <select
        value={selectedId || ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select account</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.label || account.name || account.email || account.id}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * OutputsPage - Reel upload gallery and social media distribution
 */
export function OutputsPage() {
  const {
    apiBaseUrl,
    allAccounts,
    youtubeConfigured,
    youtubeAccountId,
    youtubeTitle,
    youtubeDescription,
    youtubeTagsInput,
    youtubeUploading,
    youtubeMessage,
    facebookConfigured,
    facebookAccountId,
    facebookCaption,
    facebookUploading,
    facebookMessage,
    facebookSharing,
    facebookLastPostUrl,
    instagramAccountId,
    instagramCaption,
    instagramUploading,
    instagramMessage,
    reels,
    jobs,
    reelCardUploading,
    reelCardMessage,
    statusMessage,
    captionSuggesting,
    captionSuggestTarget,
    negativeCaptionSuggesting,
    negativeCaptionSuggestTarget,
    niches,
    captionNiche,
    setYoutubeAccountId,
    setYoutubeTitle,
    setYoutubeDescription,
    setYoutubeTagsInput,
    setFacebookAccountId,
    setFacebookCaption,
    setInstagramAccountId,
    setInstagramCaption,
    setCaptionNiche,
    handleUploadLatestToYoutube,
    handleUploadLatestToFacebook,
    handleUploadLatestToInstagram,
    handleUploadReelTo,
    handleSuggestCaption,
    handleSuggestNegativeCaption,
    applyTrendingHashtags,
    markReelUploaded,
    openShowcaseModal,
    handleUnstarShowcase,
    handleShareLatestFacebookPostToOtherPages,
    handleMarkAllUploaded,
    showcaseReel,
    showcaseTitleInput,
    showcaseDescInput,
    showcaseMessage,
    showcaseSaving,
    closeShowcaseModal,
    handleSaveShowcase,
    setShowcaseTitleInput,
    setShowcaseDescInput,
  } = useAppStore(useShallow((state) => ({
    apiBaseUrl: state.apiBaseUrl,
    allAccounts: state.allAccounts,
    youtubeConfigured: state.youtubeConfigured,
    youtubeAccountId: state.youtubeAccountId,
    youtubeTitle: state.youtubeTitle,
    youtubeDescription: state.youtubeDescription,
    youtubeTagsInput: state.youtubeTagsInput,
    youtubeUploading: state.youtubeUploading,
    youtubeMessage: state.youtubeMessage,
    facebookConfigured: state.facebookConfigured,
    facebookAccountId: state.facebookAccountId,
    facebookCaption: state.facebookCaption,
    facebookUploading: state.facebookUploading,
    facebookMessage: state.facebookMessage,
    facebookSharing: state.facebookSharing,
    facebookLastPostUrl: state.facebookLastPostUrl,
    instagramAccountId: state.instagramAccountId,
    instagramCaption: state.instagramCaption,
    instagramUploading: state.instagramUploading,
    instagramMessage: state.instagramMessage,
    reels: state.reels,
    jobs: state.jobs,
    reelCardUploading: state.reelCardUploading,
    reelCardMessage: state.reelCardMessage,
    statusMessage: state.statusMessage,
    captionSuggesting: state.captionSuggesting,
    captionSuggestTarget: state.captionSuggestTarget,
    negativeCaptionSuggesting: state.negativeCaptionSuggesting,
    negativeCaptionSuggestTarget: state.negativeCaptionSuggestTarget,
    niches: state.niches,
    captionNiche: state.captionNiche,
    setYoutubeAccountId: state.setYoutubeAccountId,
    setYoutubeTitle: state.setYoutubeTitle,
    setYoutubeDescription: state.setYoutubeDescription,
    setYoutubeTagsInput: state.setYoutubeTagsInput,
    setFacebookAccountId: state.setFacebookAccountId,
    setFacebookCaption: state.setFacebookCaption,
    setInstagramAccountId: state.setInstagramAccountId,
    setInstagramCaption: state.setInstagramCaption,
    setCaptionNiche: state.setCaptionNiche,
    handleUploadLatestToYoutube: state.handleUploadLatestToYoutube,
    handleUploadLatestToFacebook: state.handleUploadLatestToFacebook,
    handleUploadLatestToInstagram: state.handleUploadLatestToInstagram,
    handleUploadReelTo: state.handleUploadReelTo,
    handleSuggestCaption: state.handleSuggestCaption,
    handleSuggestNegativeCaption: state.handleSuggestNegativeCaption,
    applyTrendingHashtags: state.applyTrendingHashtags,
    markReelUploaded: state.markReelUploaded,
    openShowcaseModal: state.openShowcaseModal,
    handleUnstarShowcase: state.handleUnstarShowcase,
    handleShareLatestFacebookPostToOtherPages:
      state.handleShareLatestFacebookPostToOtherPages,
    handleMarkAllUploaded: state.handleMarkAllUploaded,
    showcaseReel: state.showcaseReel,
    showcaseTitleInput: state.showcaseTitleInput,
    showcaseDescInput: state.showcaseDescInput,
    showcaseMessage: state.showcaseMessage,
    showcaseSaving: state.showcaseSaving,
    closeShowcaseModal: state.closeShowcaseModal,
    handleSaveShowcase: state.handleSaveShowcase,
    setShowcaseTitleInput: state.setShowcaseTitleInput,
    setShowcaseDescInput: state.setShowcaseDescInput,
  })));

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

  const connectedYoutubeAccounts = useMemo(
    () => youtubeAccounts.filter((account) => account.connected),
    [youtubeAccounts],
  );
  const connectedFacebookAccounts = useMemo(
    () => facebookAccounts.filter((account) => account.connected),
    [facebookAccounts],
  );
  const connectedInstagramAccounts = useMemo(
    () => instagramAccounts.filter((account) => account.connected),
    [instagramAccounts],
  );

  const latestReel = reels[0];
  const latestJob = jobs[0];
  const newReels = useMemo(() => reels.filter((reel) => !reel.uploaded), [reels]);
  const uploadedReels = useMemo(() => reels.filter((reel) => reel.uploaded), [reels]);

  const latestReelUploadedToYoutube =
    latestReel?.uploadLog.some(
      (record) =>
        record.platform === "youtube" &&
        (!youtubeAccountId || record.accountId === youtubeAccountId),
    ) ?? false;
  const latestReelUploadedToFacebook =
    latestReel?.uploadLog.some(
      (record) =>
        record.platform === "facebook" &&
        (!facebookAccountId || record.accountId === facebookAccountId),
    ) ?? false;
  const latestReelUploadedToInstagram =
    latestReel?.uploadLog.some(
      (record) =>
        record.platform === "instagram" &&
        (!instagramAccountId || record.accountId === instagramAccountId),
    ) ?? false;

  const selectedNicheForCaption = captionNiche;
  const setSelectedNicheForCaption = setCaptionNiche;
  // Helper to render niche select
  const renderNicheSelect = () => (
    <select
      value={selectedNicheForCaption}
      onChange={(e) => setSelectedNicheForCaption(e.target.value)}
      aria-label="Niche"
    >
      <option value="">Select niche for context</option>
      {niches.map((n) => (
        <option key={n.id} value={n.id}>
          {n.label}
        </option>
      ))}
    </select>
  );

  return (
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
              Configure API env: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`.
            </p>
          ) : (
            <div className="youtube-upload-form">
              {renderAccountDropdown(
                youtubeAccounts,
                youtubeAccountId,
                setYoutubeAccountId,
                "YouTube"
              )}
              {connectedYoutubeAccounts.length > 0 && (
                <>
                  <label>
                    YouTube title
                    <input
                      type="text"
                      value={youtubeTitle}
                      maxLength={100}
                      onChange={(event) => setYoutubeTitle(event.target.value)}
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
                "Facebook"
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
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => void handleSuggestCaption("facebook")}
                      disabled={captionSuggesting || negativeCaptionSuggesting}
                    >
                      {captionSuggesting && captionSuggestTarget === "facebook"
                        ? "Generating..."
                        : "✨ Suggest caption"}
                    </button>
                    <button
                      type="button"
                      className="ghost-btn negative-script-btn"
                      onClick={() =>
                        void handleSuggestNegativeCaption("facebook")
                      }
                      disabled={captionSuggesting || negativeCaptionSuggesting}
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
                      onClick={() => void handleUploadLatestToFacebook()}
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
                      {facebookSharing ? "Sharing..." : "Share to other pages"}
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
                "Instagram"
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
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => void handleSuggestCaption("instagram")}
                      disabled={captionSuggesting || negativeCaptionSuggesting}
                    >
                      {captionSuggesting && captionSuggestTarget === "instagram"
                        ? "Generating..."
                        : "✨ Suggest caption"}
                    </button>
                    <button
                      type="button"
                      className="ghost-btn negative-script-btn"
                      onClick={() =>
                        void handleSuggestNegativeCaption("instagram")
                      }
                      disabled={captionSuggesting || negativeCaptionSuggesting}
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
                      onClick={() => void handleUploadLatestToInstagram()}
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
                    (!facebookAccountId || r.accountId === facebookAccountId)
                );
                const doneOnYt = reel.uploadLog.some(
                  (r) =>
                    r.platform === "youtube" &&
                    (!youtubeAccountId || r.accountId === youtubeAccountId)
                );
                const doneOnIg = reel.uploadLog.some(
                  (r) =>
                    r.platform === "instagram" &&
                    (!instagramAccountId || r.accountId === instagramAccountId)
                );
                return (
                  <article key={reel.id} className="reel-card">
                    <h3>{reel.folder}</h3>
                    {reel.nicheLabel && (
                      <p className="reel-card-niche muted small">
                        Niche: {reel.nicheLabel}
                      </p>
                    )}
                    <video controls src={`${apiBaseUrl}${reel.videoUrl}`} />
                    <div className="links">
                      <a href={`${apiBaseUrl}${reel.videoUrl}`} target="_blank">
                        video
                      </a>
                      <a href={`${apiBaseUrl}${reel.srtUrl}`} target="_blank">
                        srt
                      </a>
                      <a href={`${apiBaseUrl}${reel.txtUrl}`} target="_blank">
                        txt
                      </a>
                    </div>
                    <div className="reel-card-upload-row">
                      {connectedFacebookAccounts.length > 0 && (
                        <button
                          type="button"
                          className={`ghost-btn reel-upload-btn reel-upload-fb${doneOnFb ? " reel-upload-done" : ""
                            }`}
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
                          className={`ghost-btn reel-upload-btn reel-upload-yt${doneOnYt ? " reel-upload-done" : ""
                            }`}
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
                          className={`ghost-btn reel-upload-btn reel-upload-ig${doneOnIg ? " reel-upload-done" : ""
                            }`}
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
                        onClick={() => void markReelUploaded(reel.id, true)}
                        disabled={!!uploading}
                        title="Manually mark as uploaded without posting"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        className={`ghost-btn reel-upload-btn${reel.showcase ? " reel-showcase-on" : ""
                          }`}
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
                    {reel.showcase &&
                      (reel.showcaseTitle || reel.showcaseDescription) && (
                        <p className="muted small reel-card-showcase">
                          {reel.showcaseTitle ?? reel.folder}
                          {reel.showcaseDescription
                            ? ` — ${reel.showcaseDescription}`
                            : ""}
                        </p>
                      )}
                    {cardMsg && (
                      <p className="muted small reel-card-msg">{cardMsg}</p>
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
            <p className="muted small">No uploaded reels flagged yet.</p>
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
                          title={`Uploaded ${new Date(
                            record.uploadedAt
                          ).toLocaleString()}`}
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
                    !reel.uploadLog?.some((r) => r.platform === "youtube") ? (
                    <a href={reel.youtubeUrl} target="_blank" rel="noreferrer">
                      open youtube
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => void markReelUploaded(reel.id, false)}
                  >
                    Mark as new
                  </button>
                  <button
                    type="button"
                    className={`ghost-btn reel-upload-btn${reel.showcase ? " reel-showcase-on" : ""
                      }`}
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
                  {reel.showcase &&
                    (reel.showcaseTitle || reel.showcaseDescription) && (
                      <p className="muted small reel-card-showcase">
                        {reel.showcaseTitle ?? reel.folder}
                        {reel.showcaseDescription
                          ? ` — ${reel.showcaseDescription}`
                          : ""}
                      </p>
                    )}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      {showcaseReel && (
        <div
          className="showcase-modal-overlay"
          role="presentation"
          onClick={closeShowcaseModal}
        >
          <div
            className="showcase-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Showcase details"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Showcase details</h2>
            <label className="label" htmlFor="showcase-title">
              Title
            </label>
            <input
              id="showcase-title"
              className="field-input"
              type="text"
              maxLength={120}
              value={showcaseTitleInput}
              onChange={(event) => setShowcaseTitleInput(event.target.value)}
              placeholder={showcaseReel.folder}
            />
            <label className="label" htmlFor="showcase-description">
              Description
            </label>
            <textarea
              id="showcase-description"
              className="field-input"
              rows={4}
              maxLength={400}
              value={showcaseDescInput}
              onChange={(event) => setShowcaseDescInput(event.target.value)}
              placeholder="Short description for web-orders showcase"
            />
            {showcaseMessage ? <p className="muted small">{showcaseMessage}</p> : null}
            <div className="showcase-modal-actions">
              <button type="button" className="ghost-btn" onClick={closeShowcaseModal}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveShowcase()}
                disabled={showcaseSaving}
              >
                {showcaseSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="status">{statusMessage || "Ready to create."}</footer>
    </div>
  );
}
