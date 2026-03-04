import { create } from "zustand";
import type { FormEvent } from "react";
import { cachedFetch, clearCacheForUrl } from "../cachedFetch";
import {
  formatCaptionHashtags,
  parseFacebookPageIdFromUrl,
  sendNotification,
} from "../helpers";
import type {
  ClipItem,
  ClipTranscriptInfo,
  FacebookStatusResponse,
  FontItem,
  FontsResponse,
  NicheItem,
  Order,
  OrderStatus,
  Pipeline,
  Platform,
  ReelItem,
  ReelJob,
  SettingsVoice,
  SocialAccount,
  VoicesResponse,
  YoutubeStatusResponse,
} from "../types";

type SettingsTab =
  | "accounts"
  | "niches"
  | "pipelines"
  | "fonts"
  | "clips"
  | "payment"
  | "pricing"
  | "voices"
  | "danger";

type CaptionLang = "auto" | "english" | "tagalog" | "taglish";

type OrderPricing = {
  wordsPerFrame: number;
  pricePerFramePesos: number;
  pricePerFramePesosByTier?: {
    ttsOnly: number;
    clipOnly: number;
    clipAndNarrator: number;
  };
};

type OrderPricingEdit = {
  wordsPerFrame: string;
  pricePerFramePesos: string;
  clipOnly: string;
  clipAndNarrator: string;
};

type StateUpdater<T> = T | ((prev: T) => T);

type AppStore = {
  apiBaseUrl: string;
  apiVpsBaseUrl: string;
  envLabel: "local" | "dev" | "production";

  initialized: boolean;

  statusMessage: string;

  settingsTab: SettingsTab;
  settingsVoices: SettingsVoice[];
  settingsVoicesTogglingId: string | null;

  paymentMethodOptions: Array<{ id: string; label: string }>;
  paymentMethodsEnabled: string[];
  paymentMethodsSaving: boolean;
  paymentMethodsMessage: string;

  allAccounts: SocialAccount[];
  youtubeConfigured: boolean;
  facebookConfigured: boolean;

  youtubeAccountId: string;
  youtubeUploading: boolean;
  youtubeMessage: string;
  youtubeTitle: string;
  youtubeDescription: string;
  youtubeTagsInput: string;

  facebookAccountId: string;
  facebookUploading: boolean;
  facebookSharing: boolean;
  facebookMessage: string;
  facebookCaption: string;
  facebookLastPostUrl: string;

  instagramAccountId: string;
  instagramUploading: boolean;
  instagramMessage: string;
  instagramCaption: string;

  reels: ReelItem[];
  jobs: ReelJob[];
  reelCardUploading: Record<string, string>;
  reelCardMessage: Record<string, string>;

  showcaseReel: ReelItem | null;
  showcaseTitleInput: string;
  showcaseDescInput: string;
  showcaseSaving: boolean;
  showcaseMessage: string;

  captionNiche: string;
  captionLang: CaptionLang;
  captionSuggesting: boolean;
  captionSuggestTarget: "facebook" | "instagram" | null;
  negativeCaptionSuggesting: boolean;
  negativeCaptionSuggestTarget: "facebook" | "instagram" | null;

  newAccountPlatform: Platform;
  newAccountLabel: string;
  settingsMessage: string;

  clips: ClipItem[];
  selectedFiles: FileList | null;

  fonts: FontItem[];
  fontMessage: string;
  editingFontId: string | null;
  editingFontName: string;
  fontUploadFile: File | null;

  edgeVoices: Array<{ id: string; name: string; locale: string }>;

  gameClips: ClipItem[];
  orderClips: ClipItem[];
  clipMessage: string;
  editingClipId: string | null;
  editingClipName: string;
  editingClipType: "game" | "order";
  gameClipUploadFile: File | null;
  orderClipUploadFile: File | null;

  niches: NicheItem[];
  newNicheLabel: string;
  newNicheKeywords: string;
  newNicheFeeds: string;
  nicheMessage: string;
  postingNicheId: string | null;
  postingReelNicheId: string | null;
  editingNicheId: string | null;
  editNicheLabel: string;
  editNicheKeywords: string;
  editNicheFeeds: string;

  pipelines: Pipeline[];
  pipelineRunningIds: Set<string>;
  editingPipeline: Pipeline | null;
  showNewPipelineForm: boolean;
  pipelineMessage: string;

  orders: Order[];
  orderPricing: OrderPricing | null;
  orderClipTranscripts: Record<string, ClipTranscriptInfo>;
  orderUseClipAudio: Record<string, boolean>;
  orderUseClipAudioWithNarrator: Record<string, boolean>;
  ordersFilterStatus: string;
  ordersFilterPayment: string;
  ordersFilterReference: string;
  ordersFilterBank: string;
  ordersFilterDateStart: string;
  ordersFilterDateEnd: string;
  deleteAllOrdersInProgress: boolean;
  orderDeletingId: string | null;
  orderPricingEdit: OrderPricingEdit;
  orderPricingSaving: boolean;
  processingOrders: Record<string, boolean>;
  kanbanDragOrderId: string | null;
  kanbanDropTarget: OrderStatus | null;

  setStatusMessage: (value: string) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setYoutubeAccountId: (value: string) => void;
  setYoutubeTitle: (value: string) => void;
  setYoutubeDescription: (value: string) => void;
  setYoutubeTagsInput: (value: string) => void;
  setYoutubeMessage: (value: string) => void;
  setFacebookAccountId: (value: string) => void;
  setFacebookCaption: (value: string) => void;
  setFacebookMessage: (value: string) => void;
  setFacebookLastPostUrl: (value: string) => void;
  setInstagramAccountId: (value: string) => void;
  setInstagramCaption: (value: string) => void;
  setInstagramMessage: (value: string) => void;
  setCaptionNiche: (value: string) => void;
  setCaptionLang: (value: CaptionLang) => void;

  setNewAccountPlatform: (value: Platform) => void;
  setNewAccountLabel: (value: string) => void;
  setSettingsMessage: (value: string) => void;

  setFontUploadFile: (value: File | null) => void;
  setFontMessage: (value: string) => void;
  setEditingFontId: (value: string | null) => void;
  setEditingFontName: (value: string) => void;

  setGameClipUploadFile: (value: File | null) => void;
  setOrderClipUploadFile: (value: File | null) => void;
  setClipMessage: (value: string) => void;
  setEditingClipId: (value: string | null) => void;
  setEditingClipType: (value: "game" | "order" | null) => void;
  setEditingClipName: (value: string) => void;

  setNewNicheLabel: (value: string) => void;
  setNewNicheKeywords: (value: string) => void;
  setNewNicheFeeds: (value: string) => void;
  setNicheMessage: (value: string) => void;
  setEditingNicheId: (value: string | null) => void;
  setEditNicheLabel: (value: string) => void;
  setEditNicheKeywords: (value: string) => void;
  setEditNicheFeeds: (value: string) => void;
  setPostingNicheId: (value: string | null) => void;
  setPostingReelNicheId: (value: string | null) => void;

  setShowNewPipelineForm: (value: boolean) => void;
  setEditingPipeline: (value: Pipeline | null) => void;
  setPipelineMessage: (value: string) => void;

  setPaymentMethodsEnabled: (value: StateUpdater<string[]>) => void;
  setPaymentMethodsSaving: (value: boolean) => void;
  setPaymentMethodsMessage: (value: string) => void;

  setOrderPricingEdit: (value: StateUpdater<OrderPricingEdit>) => void;
  setOrderUseClipAudio: (value: StateUpdater<Record<string, boolean>>) => void;
  setOrderUseClipAudioWithNarrator: (
    value: StateUpdater<Record<string, boolean>>,
  ) => void;
  setOrdersFilterStatus: (value: string) => void;
  setOrdersFilterPayment: (value: string) => void;
  setOrdersFilterReference: (value: string) => void;
  setOrdersFilterBank: (value: string) => void;
  setOrdersFilterDateStart: (value: string) => void;
  setOrdersFilterDateEnd: (value: string) => void;
  setKanbanDropTarget: (value: OrderStatus | null) => void;
  setKanbanDragOrderId: (value: string | null) => void;

  setShowcaseTitleInput: (value: string) => void;
  setShowcaseDescInput: (value: string) => void;
  setShowcaseMessage: (value: string) => void;
  setReelCardMessage: (value: Record<string, string>) => void;

  initialize: () => Promise<void>;
  refreshAll: () => Promise<void>;

  loadClips: () => Promise<void>;
  loadVoices: () => Promise<void>;
  loadFonts: () => Promise<void>;
  loadReels: () => Promise<void>;
  loadAllAccounts: () => Promise<void>;
  loadNiches: () => Promise<void>;
  loadPipelines: () => Promise<void>;
  loadOrders: () => Promise<void>;
  loadActiveJobs: () => Promise<void>;
  loadGameClips: () => Promise<void>;
  loadOrderClips: () => Promise<void>;
  loadOrderClipTranscripts: (clipNames: string[]) => Promise<void>;
  loadYoutubeStatus: () => Promise<void>;
  loadFacebookStatus: () => Promise<void>;

  handleToggleVoiceEnabled: (voiceId: string, enabled: boolean) => Promise<void>;
  handleSaveOrderPricing: () => Promise<void>;

  handleDeleteAllOrdersAndRelated: () => Promise<void>;
  handleDeleteOrder: (orderId: string) => Promise<void>;
  handleSetOrderStatus: (orderId: string, orderStatus: OrderStatus) => Promise<void>;
  handleToggleOrderProcessing: (order: Order) => Promise<void>;

  handleUploadReelTo: (
    reel: ReelItem,
    platform: "facebook" | "youtube" | "instagram",
  ) => Promise<void>;

  openShowcaseModal: (reel: ReelItem) => void;
  closeShowcaseModal: () => void;
  handleSaveShowcase: () => Promise<void>;
  handleUnstarShowcase: (reel: ReelItem) => Promise<void>;

  handleAddNiche: (e: FormEvent) => Promise<void>;
  handleDeleteNiche: (id: string) => Promise<void>;
  startEditNiche: (niche: NicheItem) => void;
  handleSaveNiche: (id: string) => Promise<void>;

  handleAddAccount: (event: FormEvent) => Promise<void>;
  handleConnectAccount: (accountId: string, platform: Platform) => Promise<void>;
  handleDisconnectAccount: (accountId: string) => Promise<void>;
  handleDeleteAccount: (accountId: string) => Promise<void>;

  handleSavePipeline: (id: string, data: Partial<Pipeline>) => Promise<void>;
  handleCreatePipeline: (data: Partial<Pipeline> & { label: string }) => Promise<void>;
  handleDeletePipeline: (id: string) => Promise<void>;
  handleRunPipeline: (id: string, label: string) => Promise<void>;
  handlePostSomethingForNiche: (niche: NicheItem) => Promise<void>;
  handlePostReelForNiche: (niche: NicheItem) => Promise<void>;
  handleRunAll: () => Promise<void>;
  handleStopPipeline: (id: string, label: string) => Promise<void>;
  handleStopAll: () => Promise<void>;

  handleUploadFont: (e: FormEvent) => Promise<void>;
  handleUpdateFont: (id: string) => Promise<void>;
  handleDeleteFont: (id: string) => Promise<void>;

  handleUploadGameClip: (e: FormEvent) => Promise<void>;
  handleUploadOrderClip: (e: FormEvent) => Promise<void>;
  handleUpdateClip: (type: "game" | "order", id: string) => Promise<void>;
  handleDeleteClip: (type: "game" | "order", id: string) => Promise<void>;

  handleUploadLatestToYoutube: () => Promise<void>;
  applyTrendingHashtags: () => void;
  handleUploadLatestToFacebook: () => Promise<void>;
  handleShareLatestFacebookPostToOtherPages: () => Promise<void>;
  handleUploadLatestToInstagram: () => Promise<void>;

  handleSuggestCaption: (target: "facebook" | "instagram") => Promise<void>;
  handleSuggestNegativeCaption: (
    target: "facebook" | "instagram",
  ) => Promise<void>;

  markReelUploaded: (
    reelId: string,
    uploaded: boolean,
    youtubeUrl?: string,
  ) => Promise<void>;
  handleMarkAllUploaded: () => Promise<void>;

  handleOAuthConnectedRedirect: (search: string) => Promise<boolean>;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3010";
const apiVpsBaseUrl = import.meta.env.VITE_API_VPS_BASE_URL ?? "";
const appEnv = (import.meta.env.VITE_APP_ENV ?? "local").toLowerCase();
const envLabel: "local" | "dev" | "production" =
  appEnv === "production" ? "production" : appEnv === "dev" ? "dev" : "local";

const thisYear = new Date().getFullYear();

function updateWithUpdater<T>(current: T, value: StateUpdater<T>): T {
  return typeof value === "function" ? (value as (prev: T) => T)(current) : value;
}

export const useAppStore = create<AppStore>((set, get) => ({
  apiBaseUrl,
  apiVpsBaseUrl,
  envLabel,
  initialized: false,
  statusMessage: "",

  settingsTab: "accounts",
  settingsVoices: [],
  settingsVoicesTogglingId: null,

  paymentMethodOptions: [],
  paymentMethodsEnabled: [],
  paymentMethodsSaving: false,
  paymentMethodsMessage: "",

  allAccounts: [],
  youtubeConfigured: false,
  facebookConfigured: false,

  youtubeAccountId: "",
  youtubeUploading: false,
  youtubeMessage: "",
  youtubeTitle: "",
  youtubeDescription: "shorts",
  youtubeTagsInput: "shorts, youtubeshorts, gaming, viral, fyp",

  facebookAccountId: "",
  facebookUploading: false,
  facebookSharing: false,
  facebookMessage: "",
  facebookCaption: "reels shorts viral fyp trending",
  facebookLastPostUrl: "",

  instagramAccountId: "",
  instagramUploading: false,
  instagramMessage: "",
  instagramCaption: "reels shorts viral fyp trending",

  reels: [],
  jobs: [],
  reelCardUploading: {},
  reelCardMessage: {},

  showcaseReel: null,
  showcaseTitleInput: "",
  showcaseDescInput: "",
  showcaseSaving: false,
  showcaseMessage: "",

  captionNiche: "gaming",
  captionLang: "auto",
  captionSuggesting: false,
  captionSuggestTarget: null,
  negativeCaptionSuggesting: false,
  negativeCaptionSuggestTarget: null,

  newAccountPlatform: "youtube",
  newAccountLabel: "",
  settingsMessage: "",

  clips: [],
  selectedFiles: null,

  fonts: [],
  fontMessage: "",
  editingFontId: null,
  editingFontName: "",
  fontUploadFile: null,

  edgeVoices: [],

  gameClips: [],
  orderClips: [],
  clipMessage: "",
  editingClipId: null,
  editingClipName: "",
  editingClipType: "game",
  gameClipUploadFile: null,
  orderClipUploadFile: null,

  niches: [],
  newNicheLabel: "",
  newNicheKeywords: "",
  newNicheFeeds: "",
  nicheMessage: "",
  postingNicheId: null,
  postingReelNicheId: null,
  editingNicheId: null,
  editNicheLabel: "",
  editNicheKeywords: "",
  editNicheFeeds: "",

  pipelines: [],
  pipelineRunningIds: new Set<string>(),
  editingPipeline: null,
  showNewPipelineForm: false,
  pipelineMessage: "",

  orders: [],
  orderPricing: null,
  orderClipTranscripts: {},
  orderUseClipAudio: {},
  orderUseClipAudioWithNarrator: {},
  ordersFilterStatus: "",
  ordersFilterPayment: "",
  ordersFilterReference: "",
  ordersFilterBank: "",
  ordersFilterDateStart: `${thisYear}-01-01`,
  ordersFilterDateEnd: `${thisYear}-12-31`,
  deleteAllOrdersInProgress: false,
  orderDeletingId: null,
  orderPricingEdit: {
    wordsPerFrame: "5",
    pricePerFramePesos: "3",
    clipOnly: "5",
    clipAndNarrator: "7",
  },
  orderPricingSaving: false,
  processingOrders: {},
  kanbanDragOrderId: null,
  kanbanDropTarget: null,

  setStatusMessage: (value) => set({ statusMessage: value }),
  setSettingsTab: (tab) => {
    set({ settingsTab: tab });
    if (tab === "clips") {
      void Promise.all([get().loadGameClips(), get().loadOrderClips()]);
    }
    if (tab === "payment") {
      set({ paymentMethodsMessage: "" });
      void cachedFetch(`${apiBaseUrl}/api/settings/payment-methods`, {
        ttl: 60000,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then(
          (
            data:
              | { options?: Array<{ id: string; label: string }>; enabled?: string[] }
              | null,
          ) => {
            if (data?.options) set({ paymentMethodOptions: data.options });
            if (Array.isArray(data?.enabled)) {
              set({ paymentMethodsEnabled: data.enabled });
            }
          },
        )
        .catch(() => set({ paymentMethodsMessage: "Failed to load payment methods." }));
    }
    if (tab === "voices") {
      void cachedFetch(`${apiBaseUrl}/api/settings/voices`, { ttl: 60000 })
        .then((r) => (r.ok ? r.json() : []))
        .then((data: SettingsVoice[]) =>
          set({ settingsVoices: Array.isArray(data) ? data : [] }),
        )
        .catch(() => set({ settingsVoices: [] }));
    }
  },

  setYoutubeAccountId: (value) => set({ youtubeAccountId: value }),
  setYoutubeTitle: (value) => set({ youtubeTitle: value }),
  setYoutubeDescription: (value) => set({ youtubeDescription: value }),
  setYoutubeTagsInput: (value) => set({ youtubeTagsInput: value }),
  setYoutubeMessage: (value) => set({ youtubeMessage: value }),
  setFacebookAccountId: (value) => set({ facebookAccountId: value }),
  setFacebookCaption: (value) => set({ facebookCaption: value }),
  setFacebookMessage: (value) => set({ facebookMessage: value }),
  setFacebookLastPostUrl: (value) => set({ facebookLastPostUrl: value }),
  setInstagramAccountId: (value) => set({ instagramAccountId: value }),
  setInstagramCaption: (value) => set({ instagramCaption: value }),
  setInstagramMessage: (value) => set({ instagramMessage: value }),
  setCaptionNiche: (value) => set({ captionNiche: value }),
  setCaptionLang: (value) => set({ captionLang: value }),

  setNewAccountPlatform: (value) => set({ newAccountPlatform: value }),
  setNewAccountLabel: (value) => set({ newAccountLabel: value }),
  setSettingsMessage: (value) => set({ settingsMessage: value }),

  setFontUploadFile: (value) => set({ fontUploadFile: value }),
  setFontMessage: (value) => set({ fontMessage: value }),
  setEditingFontId: (value) => set({ editingFontId: value }),
  setEditingFontName: (value) => set({ editingFontName: value }),

  setGameClipUploadFile: (value) => set({ gameClipUploadFile: value }),
  setOrderClipUploadFile: (value) => set({ orderClipUploadFile: value }),
  setClipMessage: (value) => set({ clipMessage: value }),
  setEditingClipId: (value) => set({ editingClipId: value }),
  setEditingClipType: (value) => {
    if (value) set({ editingClipType: value });
  },
  setEditingClipName: (value) => set({ editingClipName: value }),

  setNewNicheLabel: (value) => set({ newNicheLabel: value }),
  setNewNicheKeywords: (value) => set({ newNicheKeywords: value }),
  setNewNicheFeeds: (value) => set({ newNicheFeeds: value }),
  setNicheMessage: (value) => set({ nicheMessage: value }),
  setEditingNicheId: (value) => set({ editingNicheId: value }),
  setEditNicheLabel: (value) => set({ editNicheLabel: value }),
  setEditNicheKeywords: (value) => set({ editNicheKeywords: value }),
  setEditNicheFeeds: (value) => set({ editNicheFeeds: value }),
  setPostingNicheId: (value) => set({ postingNicheId: value }),
  setPostingReelNicheId: (value) => set({ postingReelNicheId: value }),

  setShowNewPipelineForm: (value) => set({ showNewPipelineForm: value }),
  setEditingPipeline: (value) => set({ editingPipeline: value }),
  setPipelineMessage: (value) => set({ pipelineMessage: value }),

  setPaymentMethodsEnabled: (value) =>
    set((state) => ({
      paymentMethodsEnabled: updateWithUpdater(state.paymentMethodsEnabled, value),
    })),
  setPaymentMethodsSaving: (value) => set({ paymentMethodsSaving: value }),
  setPaymentMethodsMessage: (value) => set({ paymentMethodsMessage: value }),

  setOrderPricingEdit: (value) =>
    set((state) => ({ orderPricingEdit: updateWithUpdater(state.orderPricingEdit, value) })),
  setOrderUseClipAudio: (value) =>
    set((state) => ({ orderUseClipAudio: updateWithUpdater(state.orderUseClipAudio, value) })),
  setOrderUseClipAudioWithNarrator: (value) =>
    set((state) => ({
      orderUseClipAudioWithNarrator: updateWithUpdater(
        state.orderUseClipAudioWithNarrator,
        value,
      ),
    })),
  setOrdersFilterStatus: (value) => set({ ordersFilterStatus: value }),
  setOrdersFilterPayment: (value) => set({ ordersFilterPayment: value }),
  setOrdersFilterReference: (value) => set({ ordersFilterReference: value }),
  setOrdersFilterBank: (value) => set({ ordersFilterBank: value }),
  setOrdersFilterDateStart: (value) => set({ ordersFilterDateStart: value }),
  setOrdersFilterDateEnd: (value) => set({ ordersFilterDateEnd: value }),
  setKanbanDropTarget: (value) => set({ kanbanDropTarget: value }),
  setKanbanDragOrderId: (value) => set({ kanbanDragOrderId: value }),

  setShowcaseTitleInput: (value) => set({ showcaseTitleInput: value }),
  setShowcaseDescInput: (value) => set({ showcaseDescInput: value }),
  setShowcaseMessage: (value) => set({ showcaseMessage: value }),
  setReelCardMessage: (value) => set({ reelCardMessage: value }),

  initialize: async () => {
    if (get().initialized) return;
    await Promise.all([
      get().loadClips(),
      get().loadReels(),
      get().loadVoices(),
      get().loadFonts(),
      get().loadAllAccounts(),
      get().loadYoutubeStatus(),
      get().loadFacebookStatus(),
      get().loadNiches(),
      get().loadPipelines(),
      get().loadOrders(),
      get().loadActiveJobs(),
    ]);
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    set({ initialized: true });
  },

  refreshAll: async () => {
    set({ statusMessage: "Refreshing..." });
    try {
      await Promise.all([
        get().loadClips(),
        get().loadVoices(),
        get().loadFonts(),
        get().loadReels(),
        get().loadAllAccounts(),
        get().loadYoutubeStatus(),
        get().loadFacebookStatus(),
        get().loadOrders(),
        get().loadActiveJobs(),
      ]);
      set({ statusMessage: "Dashboard refreshed." });
    } catch {
      set({ statusMessage: "Refresh failed." });
    }
  },

  loadClips: async () => {
    try {
      const response = await cachedFetch(`${apiBaseUrl}/api/clips`, { ttl: 15000 });
      if (!response.ok) return;
      const data = (await response.json()) as ClipItem[];
      const clips = Array.isArray(data) ? data : [];
      set((state) => ({
        clips,
        selectedFiles: state.selectedFiles,
      }));
    } catch {
      set({ clips: [] });
    }
  },

  loadVoices: async () => {
    const response = await cachedFetch(`${apiBaseUrl}/api/reels/voices`, { ttl: 30000 });
    if (!response.ok) throw new Error("Failed to load voices");
    const data = (await response.json()) as VoicesResponse & { defaultVoiceId?: string };
    set({ edgeVoices: data.edge });
  },

  loadFonts: async () => {
    try {
      const response = await cachedFetch(`${apiBaseUrl}/api/reels/fonts`, { ttl: 30000 });
      if (!response.ok) return;
      const data = (await response.json()) as FontsResponse;
      const items = Array.isArray(data?.items) ? data.items : [];
      set({ fonts: items });
    } catch {
      set({ fonts: [] });
    }
  },

  loadReels: async () => {
    const response = await cachedFetch(`${apiBaseUrl}/api/reels`, { ttl: 5000 });
    if (!response.ok) throw new Error("Failed to load reels");
    const data = (await response.json()) as ReelItem[];
    set((state) => {
      const latest = data[0];
      return {
        reels: data,
        youtubeTitle:
          latest && !state.youtubeTitle.trim() ? `Short ${latest.folder}` : state.youtubeTitle,
      };
    });
  },

  loadAllAccounts: async () => {
    try {
      const response = await cachedFetch(`${apiBaseUrl}/api/accounts`, { ttl: 30000 });
      if (!response.ok) throw new Error("Failed to load accounts");
      const data = (await response.json()) as SocialAccount[];
      const allAccounts = Array.isArray(data) ? data : [];
      const connectedYoutube = allAccounts.filter(
        (a) => a.platform === "youtube" && a.connected,
      );
      const connectedFacebook = allAccounts.filter(
        (a) => a.platform === "facebook" && a.connected,
      );
      const connectedInstagram = allAccounts.filter(
        (a) => a.platform === "instagram" && a.connected,
      );
      set((state) => ({
        allAccounts,
        youtubeAccountId:
          state.youtubeAccountId || connectedYoutube.length === 0
            ? state.youtubeAccountId
            : connectedYoutube[0].id,
        facebookAccountId:
          state.facebookAccountId || connectedFacebook.length === 0
            ? state.facebookAccountId
            : connectedFacebook[0].id,
        instagramAccountId:
          state.instagramAccountId || connectedInstagram.length === 0
            ? state.instagramAccountId
            : connectedInstagram[0].id,
      }));
    } catch {
      // non-fatal
    }
  },

  loadNiches: async () => {
    try {
      const res = await cachedFetch(`${apiBaseUrl}/api/captions/niches`, { ttl: 30000 });
      if (!res.ok) return;
      const data = (await res.json()) as NicheItem[];
      set((state) => {
        const niches = Array.isArray(data) ? data : [];
        const captionNiche =
          niches.length > 0 && !niches.find((n) => n.id === state.captionNiche)
            ? niches[0].id
            : state.captionNiche;
        return { niches, captionNiche };
      });
    } catch {
      // non-fatal
    }
  },

  loadPipelines: async () => {
    try {
      const res = await cachedFetch(`${apiBaseUrl}/api/pipeline`, { ttl: 5000 });
      if (!res.ok) return;
      const list = (await res.json()) as Pipeline[];
      const runningIds = new Set<string>();
      await Promise.all(
        list.map(async (p) => {
          try {
            const sr = await cachedFetch(`${apiBaseUrl}/api/pipeline/${p.id}/status`, {
              ttl: 3000,
            });
            if (sr.ok) {
              const s = (await sr.json()) as Pipeline & { isRunning: boolean };
              if (s.isRunning) runningIds.add(p.id);
            }
          } catch {
            // non-fatal
          }
        }),
      );
      set({ pipelines: list, pipelineRunningIds: runningIds });
    } catch {
      // non-fatal
    }
  },

  loadOrders: async () => {
    try {
      const [ordersRes, pricingRes] = await Promise.all([
        cachedFetch(`${apiBaseUrl}/api/orders`, { ttl: 10000 }),
        cachedFetch(`${apiBaseUrl}/api/orders/pricing`, { ttl: 30000 }),
      ]);
      if (ordersRes.ok) {
        const data = (await ordersRes.json()) as Order[];
        const orders = Array.isArray(data) ? data : [];
        set({ orders });
        const clipNames = orders
          .map((o) => o.clipName)
          .filter((name): name is string => Boolean(name));
        if (clipNames.length > 0) {
          await get().loadOrderClipTranscripts(clipNames);
        }
      }
      if (pricingRes.ok) {
        const p = (await pricingRes.json()) as OrderPricing;
        if (typeof p.wordsPerFrame === "number") {
          const pricePerFramePesos =
            typeof p.pricePerFramePesos === "number"
              ? p.pricePerFramePesos
              : p.pricePerFramePesosByTier?.ttsOnly ?? 5;
          const orderPricing = {
            wordsPerFrame: p.wordsPerFrame,
            pricePerFramePesos,
            pricePerFramePesosByTier: p.pricePerFramePesosByTier ?? {
              ttsOnly: pricePerFramePesos,
              clipOnly: 3,
              clipAndNarrator: 4,
            },
          };
          set({
            orderPricing,
            orderPricingEdit: {
              wordsPerFrame: String(orderPricing.wordsPerFrame),
              pricePerFramePesos: String(orderPricing.pricePerFramePesos),
              clipOnly: String(orderPricing.pricePerFramePesosByTier?.clipOnly ?? 5),
              clipAndNarrator: String(
                orderPricing.pricePerFramePesosByTier?.clipAndNarrator ?? 7,
              ),
            },
          });
        }
      }
    } catch {
      // non-fatal
    }
  },

  loadOrderClipTranscripts: async (clipNames) => {
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
      set((state) => {
        const next = { ...state.orderClipTranscripts };
        results.forEach(([clipName, data]) => {
          if (data) next[clipName] = data;
        });
        return { orderClipTranscripts: next };
      });
    } catch {
      // non-fatal
    }
  },

  loadActiveJobs: async () => {
    try {
      const res = await cachedFetch(`${apiBaseUrl}/api/reels/jobs`, { ttl: 3000 });
      if (!res.ok) return;
      const data = (await res.json()) as ReelJob[];
      set({ jobs: Array.isArray(data) ? data : [] });
    } catch {
      // ignore
    }
  },

  loadGameClips: async () => {
    const res = await cachedFetch(`${apiBaseUrl}/api/clips`, { ttl: 15000 });
    if (!res.ok) return;
    const data = (await res.json()) as ClipItem[];
    set({ gameClips: Array.isArray(data) ? data : [] });
  },

  loadOrderClips: async () => {
    const res = await cachedFetch(`${apiBaseUrl}/api/order-clips`, { ttl: 15000 });
    if (!res.ok) return;
    const data = (await res.json()) as ClipItem[];
    set({ orderClips: Array.isArray(data) ? data : [] });
  },

  loadYoutubeStatus: async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/youtube/status`);
      if (!response.ok) throw new Error("Failed to load YouTube status");
      const data = (await response.json()) as YoutubeStatusResponse;
      set({ youtubeConfigured: data.configured });
    } catch {
      set({ youtubeConfigured: false });
    }
  },

  loadFacebookStatus: async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/facebook/status`);
      if (!response.ok) throw new Error("Failed to load Facebook status");
      const data = (await response.json()) as FacebookStatusResponse;
      set({ facebookConfigured: data.configured });
    } catch {
      set({ facebookConfigured: false });
    }
  },

  handleToggleVoiceEnabled: async (voiceId, enabled) => {
    set({ settingsVoicesTogglingId: voiceId });
    try {
      const res = await fetch(`${apiBaseUrl}/api/settings/voices/${encodeURIComponent(voiceId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        clearCacheForUrl(`${apiBaseUrl}/api/settings/voices`);
        set((state) => ({
          settingsVoices: state.settingsVoices.map((v) =>
            v.id === voiceId ? { ...v, enabled } : v,
          ),
        }));
      }
    } finally {
      set({ settingsVoicesTogglingId: null });
    }
  },

  handleSaveOrderPricing: async () => {
    const { orderPricingEdit } = get();
    const wpf = parseInt(orderPricingEdit.wordsPerFrame, 10);
    const pfp = parseFloat(orderPricingEdit.pricePerFramePesos);
    const clipOnly = parseFloat(orderPricingEdit.clipOnly);
    const clipAndNarrator = parseFloat(orderPricingEdit.clipAndNarrator);
    if (Number.isNaN(wpf) || wpf < 1 || wpf > 100) return;
    if (Number.isNaN(pfp) || pfp < 0) return;
    if (Number.isNaN(clipOnly) || clipOnly < 0) return;
    if (Number.isNaN(clipAndNarrator) || clipAndNarrator < 0) return;
    set({ orderPricingSaving: true });
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
        clearCacheForUrl(`${apiBaseUrl}/api/orders/pricing`);
        const p = (await res.json()) as OrderPricing;
        set({ orderPricing: p });
      }
    } finally {
      set({ orderPricingSaving: false });
    }
  },

  handleDeleteAllOrdersAndRelated: async () => {
    if (
      !window.confirm(
        "Permanently delete ALL orders, all order-generated videos, and all customer-uploaded order clips? This cannot be undone.",
      )
    ) {
      return;
    }
    set({ deleteAllOrdersInProgress: true });
    try {
      const res = await fetch(`${apiBaseUrl}/api/orders/delete-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE_ALL_ORDERS" }),
      });
      if (!res.ok) throw new Error("Delete failed");
      await Promise.all([get().loadOrders(), get().loadReels()]);
    } catch (e) {
      console.error(e);
      window.alert("Failed to delete. See console.");
    } finally {
      set({ deleteAllOrdersInProgress: false });
    }
  },

  handleDeleteOrder: async (orderId) => {
    if (
      !window.confirm(
        "Permanently delete this order and all its generated videos? This cannot be undone.",
      )
    ) {
      return;
    }
    set({ orderDeletingId: orderId });
    try {
      const res = await fetch(`${apiBaseUrl}/api/orders/${encodeURIComponent(orderId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      clearCacheForUrl(`${apiBaseUrl}/api/orders`);
      clearCacheForUrl(`${apiBaseUrl}/api/reels`);
      await Promise.all([get().loadOrders(), get().loadReels()]);
    } catch (e) {
      console.error(e);
      window.alert("Failed to delete order. See console.");
    } finally {
      set({ orderDeletingId: null });
    }
  },

  handleSetOrderStatus: async (orderId, orderStatus) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      clearCacheForUrl(`${apiBaseUrl}/api/orders`);
      await get().loadOrders();
    } catch {
      // non-fatal
    }
  },

  handleToggleOrderProcessing: async (order) => {
    const { processingOrders, orderUseClipAudio, orderUseClipAudioWithNarrator } = get();
    const isProcessing = processingOrders[order.id] === true;
    const useClipAudio = orderUseClipAudio[order.id] ?? order.useClipAudio ?? false;
    const useClipAudioWithNarrator =
      orderUseClipAudioWithNarrator[order.id] ?? order.useClipAudioWithNarrator ?? false;

    if (!isProcessing) {
      set((state) => ({
        processingOrders: { ...state.processingOrders, [order.id]: true },
      }));
      try {
        const res = await fetch(`${apiBaseUrl}/api/orders/${order.id}/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            useClipAudio,
            useClipAudioWithNarrator: useClipAudioWithNarrator || undefined,
          }),
        });
        if (!res.ok) throw new Error("Failed to queue processing job");
        const created = (await res.json()) as {
          jobId: string;
          status: ReelJob["status"];
          progress: number;
        };
        clearCacheForUrl(`${apiBaseUrl}/api/reels/jobs`);
        set((state) => ({
          jobs: [
            { id: created.jobId, status: created.status, progress: created.progress },
            ...state.jobs,
          ],
        }));
        await get().handleSetOrderStatus(order.id, "processing");
      } catch {
        set((state) => {
          const next = { ...state.processingOrders };
          delete next[order.id];
          return { processingOrders: next };
        });
      }
    } else {
      set((state) => {
        const next = { ...state.processingOrders };
        delete next[order.id];
        return { processingOrders: next };
      });
    }
  },

  handleUploadReelTo: async (reel, platform) => {
    set((state) => ({
      reelCardUploading: { ...state.reelCardUploading, [reel.id]: platform },
      reelCardMessage: {
        ...state.reelCardMessage,
        [reel.id]: `Uploading to ${platform}...`,
      },
    }));

    try {
      if (platform === "facebook") {
        const { facebookAccountId, facebookCaption } = get();
        if (!facebookAccountId) {
          set((state) => ({
            reelCardMessage: {
              ...state.reelCardMessage,
              [reel.id]: "Select a Facebook account in the Upload panel first.",
            },
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
          uploadedPages?: Array<{ name: string }>;
        };
        const pages = data.uploadedPages?.map((p) => p.name).join(", ") ?? "Facebook";
        set((state) => ({
          reelCardMessage: { ...state.reelCardMessage, [reel.id]: `✓ Posted to ${pages}` },
        }));
        await get().loadReels();
      } else if (platform === "youtube") {
        const { youtubeAccountId, youtubeTagsInput, youtubeTitle, youtubeDescription } = get();
        if (!youtubeAccountId) {
          set((state) => ({
            reelCardMessage: {
              ...state.reelCardMessage,
              [reel.id]: "Select a YouTube account in the Upload panel first.",
            },
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
        await get().markReelUploaded(reel.id, true, data.youtubeUrl);
        set((state) => ({
          reelCardMessage: { ...state.reelCardMessage, [reel.id]: "✓ Uploaded to YouTube" },
        }));
        await get().loadReels();
      } else {
        const { instagramAccountId, instagramCaption } = get();
        if (!instagramAccountId) {
          set((state) => ({
            reelCardMessage: {
              ...state.reelCardMessage,
              [reel.id]: "Select an Instagram account in the Upload panel first.",
            },
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
        set((state) => ({
          reelCardMessage: { ...state.reelCardMessage, [reel.id]: "✓ Posted to Instagram" },
        }));
        await get().loadReels();
      }
    } catch (err) {
      set((state) => ({
        reelCardMessage: {
          ...state.reelCardMessage,
          [reel.id]: err instanceof Error ? err.message : `${platform} upload failed.`,
        },
      }));
    } finally {
      set((state) => {
        const next = { ...state.reelCardUploading };
        delete next[reel.id];
        return { reelCardUploading: next };
      });
    }
  },

  openShowcaseModal: (reel) => {
    set({
      showcaseReel: reel,
      showcaseTitleInput: reel.showcaseTitle ?? reel.folder,
      showcaseDescInput: reel.showcaseDescription ?? "",
      showcaseMessage: "",
    });
  },

  closeShowcaseModal: () => {
    set({
      showcaseReel: null,
      showcaseSaving: false,
      showcaseMessage: "",
    });
  },

  handleSaveShowcase: async () => {
    const { showcaseReel, showcaseTitleInput, showcaseDescInput } = get();
    if (!showcaseReel) return;
    set({ showcaseSaving: true, showcaseMessage: "" });
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
      await get().loadReels();
      get().closeShowcaseModal();
    } catch (err) {
      set({ showcaseMessage: err instanceof Error ? err.message : "Failed to save. Try again." });
    } finally {
      set({ showcaseSaving: false });
    }
  },

  handleUnstarShowcase: async (reel) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/reels/${encodeURIComponent(reel.id)}/showcase`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showcase: false }),
      });
      if (!res.ok) throw new Error("Failed");
      await get().loadReels();
    } catch {
      set((state) => ({
        reelCardMessage: { ...state.reelCardMessage, [reel.id]: "Failed to unstar." },
      }));
    }
  },

  handleAddNiche: async (e) => {
    e.preventDefault();
    const { newNicheLabel, newNicheKeywords, newNicheFeeds } = get();
    if (!newNicheLabel.trim()) {
      set({ nicheMessage: "Label is required." });
      return;
    }
    const feeds = newNicheFeeds
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
    if (feeds.length === 0) {
      set({ nicheMessage: "At least one RSS feed URL is required." });
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
      set({
        newNicheLabel: "",
        newNicheKeywords: "",
        newNicheFeeds: "",
        nicheMessage: "Niche added.",
      });
      await get().loadNiches();
    } catch {
      set({ nicheMessage: "Failed to add niche." });
    }
  },

  handleDeleteNiche: async (id) => {
    try {
      await fetch(`${apiBaseUrl}/api/captions/niches/${id}`, { method: "DELETE" });
      await get().loadNiches();
    } catch {
      set({ nicheMessage: "Failed to delete niche." });
    }
  },

  startEditNiche: (niche) => {
    set({
      editingNicheId: niche.id,
      editNicheLabel: niche.label,
      editNicheKeywords: niche.keywords,
      editNicheFeeds: niche.rssFeeds.join("\n"),
    });
  },

  handleSaveNiche: async (id) => {
    const { editNicheFeeds, editNicheLabel, editNicheKeywords } = get();
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
      set({ editingNicheId: null });
      await get().loadNiches();
    } catch {
      set({ nicheMessage: "Failed to save niche." });
    }
  },

  handleAddAccount: async (event) => {
    event.preventDefault();
    const { newAccountLabel, newAccountPlatform } = get();
    if (!newAccountLabel.trim()) {
      set({ settingsMessage: "Enter a label for the account." });
      return;
    }
    set({ settingsMessage: "" });
    try {
      const response = await fetch(`${apiBaseUrl}/api/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: newAccountPlatform, label: newAccountLabel.trim() }),
      });
      if (!response.ok) throw new Error("Failed to create account");
      const account = (await response.json()) as SocialAccount;
      await get().loadAllAccounts();
      set({
        newAccountLabel: "",
        settingsMessage: `Account "${account.label}" created. Click Connect to authorize it.`,
      });
    } catch {
      set({ settingsMessage: "Failed to create account." });
    }
  },

  handleConnectAccount: async (accountId, platform) => {
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
      set({ settingsMessage: "Failed to start authorization." });
    }
  },

  handleDisconnectAccount: async (accountId) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/accounts/${accountId}/disconnect`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to disconnect");
      await get().loadAllAccounts();
    } catch {
      set({ settingsMessage: "Failed to disconnect account." });
    }
  },

  handleDeleteAccount: async (accountId) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/accounts/${accountId}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 204) throw new Error("Failed to delete");
      await get().loadAllAccounts();
    } catch {
      set({ settingsMessage: "Failed to delete account." });
    }
  },

  handleSavePipeline: async (id, data) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/pipeline/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save");
      await get().loadPipelines();
      set({ editingPipeline: null, pipelineMessage: "Pipeline saved." });
    } catch {
      set({ pipelineMessage: "Failed to save pipeline." });
    }
  },

  handleCreatePipeline: async (data) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      await get().loadPipelines();
      set({ showNewPipelineForm: false, pipelineMessage: "Pipeline created." });
    } catch {
      set({ pipelineMessage: "Failed to create pipeline." });
    }
  },

  handleDeletePipeline: async (id) => {
    if (!window.confirm("Delete this pipeline?")) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/pipeline/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      await get().loadPipelines();
      set({ pipelineMessage: "Pipeline deleted." });
    } catch {
      set({ pipelineMessage: "Failed to delete pipeline." });
    }
  },

  handleRunPipeline: async (id, label) => {
    set((state) => ({
      pipelineRunningIds: new Set([...state.pipelineRunningIds, id]),
      pipelineMessage: `"${label}" started...`,
    }));
    try {
      const res = await fetch(`${apiBaseUrl}/api/pipeline/${id}/run`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to trigger");
      sendNotification(
        `Pipeline "${label}" started`,
        "Generating script, rendering reel, awaiting approval for Facebook upload...",
      );
    } catch {
      set((state) => {
        const next = new Set(state.pipelineRunningIds);
        next.delete(id);
        return { pipelineRunningIds: next, pipelineMessage: `Failed to start "${label}".` };
      });
    }
  },

  handlePostSomethingForNiche: async (niche) => {
    const pipeline = get().pipelines.find((p) => p.nicheId === niche.id);
    if (!pipeline) {
      set({
        nicheMessage: `No pipeline uses "${niche.label}". Add or edit a pipeline in Auto Pipelines to use this niche.`,
      });
      return;
    }
    set({ nicheMessage: "", postingNicheId: niche.id });
    try {
      await get().handleRunPipeline(pipeline.id, pipeline.label);
    } finally {
      set({ postingNicheId: null });
    }
  },

  handlePostReelForNiche: async (niche) => {
    const pipeline = get().pipelines.find((p) => p.nicheId === niche.id);
    if (!pipeline) {
      set({
        nicheMessage: `No pipeline uses "${niche.label}". Add or edit a pipeline in Auto Pipelines to use this niche.`,
      });
      return;
    }
    set((state) => ({
      nicheMessage: "",
      postingReelNicheId: niche.id,
      pipelineRunningIds: new Set([...state.pipelineRunningIds, pipeline.id]),
      pipelineMessage: `"${pipeline.label}" started (reel)...`,
    }));
    try {
      const res = await fetch(`${apiBaseUrl}/api/pipeline/${pipeline.id}/run?forceReel=true`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to trigger");
      sendNotification(
        `Reel pipeline "${pipeline.label}" started`,
        "Generating script, rendering reel, awaiting approval for Facebook upload...",
      );
    } catch {
      set((state) => {
        const next = new Set(state.pipelineRunningIds);
        next.delete(pipeline.id);
        return {
          pipelineRunningIds: next,
          pipelineMessage: `Failed to start reel for "${niche.label}".`,
        };
      });
    } finally {
      set({ postingReelNicheId: null });
    }
  },

  handleRunAll: async () => {
    set({ pipelineMessage: "Starting all pipelines..." });
    try {
      const res = await fetch(`${apiBaseUrl}/api/pipeline/run-all`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { queued: string[] };
      set((state) => ({
        pipelineRunningIds: new Set([...state.pipelineRunningIds, ...data.queued]),
        pipelineMessage: `${data.queued.length} pipeline(s) queued.`,
      }));
      sendNotification("All pipelines started", `${data.queued.length} pipeline(s) are now running.`);
    } catch {
      set({ pipelineMessage: "Failed to start all pipelines." });
    }
  },

  handleStopPipeline: async (id, label) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/pipeline/${id}/stop`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { stopped: boolean };
      set({
        pipelineMessage: data.stopped ? `Stop requested for "${label}".` : `"${label}" is not running.`,
      });
    } catch {
      set({ pipelineMessage: `Failed to stop "${label}".` });
    }
  },

  handleStopAll: async () => {
    set({ pipelineMessage: "Stopping all running pipelines..." });
    try {
      const res = await fetch(`${apiBaseUrl}/api/pipeline/stop-all`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { stopped: string[] };
      set({ pipelineMessage: `Stop requested for ${data.stopped.length} pipeline(s).` });
    } catch {
      set({ pipelineMessage: "Failed to stop pipelines." });
    }
  },

  handleUploadFont: async (e) => {
    e.preventDefault();
    const { fontUploadFile } = get();
    if (!fontUploadFile) {
      set({ fontMessage: "Choose a .ttf or .otf file." });
      return;
    }
    set({ fontMessage: "" });
    try {
      const formData = new FormData();
      formData.append("file", fontUploadFile);
      const res = await fetch(`${apiBaseUrl}/api/fonts`, { method: "POST", body: formData });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        throw new Error(err.message ?? "Upload failed");
      }
      clearCacheForUrl(`${apiBaseUrl}/api/fonts`);
      clearCacheForUrl(`${apiBaseUrl}/api/reels/fonts`);
      set({ fontUploadFile: null, fontMessage: "Font uploaded." });
      await get().loadFonts();
    } catch (err) {
      set({ fontMessage: err instanceof Error ? err.message : "Upload failed." });
    }
  },

  handleUpdateFont: async (id) => {
    const { editingFontId, editingFontName } = get();
    if (editingFontId !== id) return;
    set({ fontMessage: "" });
    try {
      const res = await fetch(`${apiBaseUrl}/api/fonts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingFontName.trim() }),
      });
      if (!res.ok) throw new Error("Update failed");
      clearCacheForUrl(`${apiBaseUrl}/api/fonts`);
      clearCacheForUrl(`${apiBaseUrl}/api/reels/fonts`);
      set({ editingFontId: null, editingFontName: "", fontMessage: "Font updated." });
      await get().loadFonts();
    } catch {
      set({ fontMessage: "Failed to update font." });
    }
  },

  handleDeleteFont: async (id) => {
    set({ fontMessage: "" });
    try {
      const res = await fetch(`${apiBaseUrl}/api/fonts/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      clearCacheForUrl(`${apiBaseUrl}/api/fonts`);
      clearCacheForUrl(`${apiBaseUrl}/api/reels/fonts`);
      await get().loadFonts();
      set({ fontMessage: "Font deleted." });
    } catch {
      set({ fontMessage: "Failed to delete font." });
    }
  },

  handleUploadGameClip: async (e) => {
    e.preventDefault();
    const { gameClipUploadFile } = get();
    if (!gameClipUploadFile) {
      set({ clipMessage: "Choose a video file." });
      return;
    }
    set({ clipMessage: "" });
    try {
      const formData = new FormData();
      formData.append("file", gameClipUploadFile);
      const res = await fetch(`${apiBaseUrl}/api/clips`, { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json())?.message ?? "Upload failed");
      clearCacheForUrl(`${apiBaseUrl}/api/clips`);
      set({ gameClipUploadFile: null, clipMessage: "Game clip uploaded." });
      await Promise.all([get().loadGameClips(), get().loadClips()]);
    } catch (err) {
      set({ clipMessage: err instanceof Error ? err.message : "Upload failed." });
    }
  },

  handleUploadOrderClip: async (e) => {
    e.preventDefault();
    const { orderClipUploadFile } = get();
    if (!orderClipUploadFile) {
      set({ clipMessage: "Choose a video file." });
      return;
    }
    set({ clipMessage: "" });
    try {
      const formData = new FormData();
      formData.append("file", orderClipUploadFile);
      const res = await fetch(`${apiBaseUrl}/api/order-clips`, { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json())?.message ?? "Upload failed");
      clearCacheForUrl(`${apiBaseUrl}/api/order-clips`);
      set({ orderClipUploadFile: null, clipMessage: "Order clip uploaded." });
      await get().loadOrderClips();
    } catch (err) {
      set({ clipMessage: err instanceof Error ? err.message : "Upload failed." });
    }
  },

  handleUpdateClip: async (type, id) => {
    const { editingClipId, editingClipType, editingClipName } = get();
    if (editingClipId !== id || editingClipType !== type) return;
    set({ clipMessage: "" });
    try {
      const base = type === "game" ? `${apiBaseUrl}/api/clips` : `${apiBaseUrl}/api/order-clips`;
      const res = await fetch(`${base}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingClipName.trim() }),
      });
      if (!res.ok) throw new Error("Update failed");
      set({ editingClipId: null, editingClipName: "", clipMessage: "Clip updated." });
      await Promise.all([get().loadGameClips(), get().loadOrderClips()]);
      if (type === "game") await get().loadClips();
    } catch {
      set({ clipMessage: "Failed to update clip." });
    }
  },

  handleDeleteClip: async (type, id) => {
    set({ clipMessage: "" });
    try {
      const base = type === "game" ? `${apiBaseUrl}/api/clips` : `${apiBaseUrl}/api/order-clips`;
      const res = await fetch(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      await Promise.all([get().loadGameClips(), get().loadOrderClips()]);
      if (type === "game") await get().loadClips();
      set({ clipMessage: "Clip deleted." });
    } catch {
      set({ clipMessage: "Failed to delete clip." });
    }
  },

  handleUploadLatestToYoutube: async () => {
    const { reels, youtubeTitle, youtubeAccountId, youtubeTagsInput, youtubeDescription } = get();
    const latestReel = reels[0];
    if (!latestReel) {
      set({ youtubeMessage: "No generated reel available to upload." });
      return;
    }
    if (!youtubeTitle.trim()) {
      set({ youtubeMessage: "Please add a YouTube title." });
      return;
    }
    if (!youtubeAccountId) {
      set({ youtubeMessage: "Select a YouTube account." });
      return;
    }
    set({ youtubeUploading: true, youtubeMessage: "" });
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
      await get().markReelUploaded(latestReel.id, true, data.youtubeUrl);
      set({ youtubeMessage: `Uploaded to YouTube: ${data.youtubeUrl}` });
    } catch (error) {
      set({
        youtubeMessage: error instanceof Error ? error.message : "YouTube upload failed.",
      });
    } finally {
      set({ youtubeUploading: false });
    }
  },

  applyTrendingHashtags: () => {
    const { captionNiche } = get();
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
    const tags = nicheTagMap[captionNiche] ?? nicheTagMap.news;
    set({ youtubeTagsInput: tags.join(", ") });
  },

  handleUploadLatestToFacebook: async () => {
    const { reels, facebookAccountId, facebookCaption } = get();
    const latestReel = reels[0];
    if (!latestReel) {
      set({ facebookMessage: "No generated reel available to upload." });
      return;
    }
    if (!facebookAccountId) {
      set({ facebookMessage: "Select a Facebook account." });
      return;
    }
    set({ facebookUploading: true, facebookMessage: "" });
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
      set({ facebookLastPostUrl: data.facebookUrls?.[0] ?? data.facebookUrl });
      if (data.facebookUrls && data.facebookUrls.length > 1) {
        const posted = data.uploadedPages?.map((p) => p.name).join(", ") ?? `${data.facebookUrls.length} pages`;
        if (data.partial) {
          const failed = data.failedPages?.map((p) => p.name).join(", ") ?? "some pages";
          set({ facebookMessage: `Posted to: ${posted}. Failed: ${failed}.` });
        } else {
          set({ facebookMessage: `Posted to all pages: ${posted}.` });
        }
      } else {
        set({ facebookMessage: `Posted to Facebook: ${data.facebookUrl}` });
      }
    } catch (error) {
      set({
        facebookMessage: error instanceof Error ? error.message : "Facebook upload failed.",
      });
    } finally {
      set({ facebookUploading: false });
    }
  },

  handleShareLatestFacebookPostToOtherPages: async () => {
    const { facebookAccountId, facebookLastPostUrl } = get();
    if (!facebookAccountId) {
      set({ facebookMessage: "Select a Facebook account." });
      return;
    }
    if (!facebookLastPostUrl) {
      set({ facebookMessage: "Post to Facebook first, then share it." });
      return;
    }

    set({ facebookSharing: true });
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
        const badNames = data.failedPages?.map((p) => p.name).join(", ") ?? "some pages";
        set({ facebookMessage: `Shared to: ${okNames}. Failed: ${badNames}.` });
      } else {
        set({ facebookMessage: `Shared to other pages: ${okNames}` });
      }
    } catch (error) {
      set({
        facebookMessage: error instanceof Error ? error.message : "Facebook share failed.",
      });
    } finally {
      set({ facebookSharing: false });
    }
  },

  handleUploadLatestToInstagram: async () => {
    const { reels, instagramAccountId, instagramCaption } = get();
    const latestReel = reels[0];
    if (!latestReel) {
      set({ instagramMessage: "No generated reel available to upload." });
      return;
    }
    if (!instagramAccountId) {
      set({ instagramMessage: "Select an Instagram account." });
      return;
    }
    set({ instagramUploading: true, instagramMessage: "" });
    try {
      const response = await fetch(`${apiBaseUrl}/api/facebook/upload-instagram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reelId: latestReel.id,
          accountId: instagramAccountId,
          caption: instagramCaption.trim(),
        }),
      });
      if (!response.ok) {
        const err = (await response.json()) as { message?: string };
        throw new Error(err.message ?? "Upload failed");
      }
      const data = (await response.json()) as { instagramUrl: string };
      set({ instagramMessage: `Posted to Instagram: ${data.instagramUrl}` });
    } catch (error) {
      set({
        instagramMessage: error instanceof Error ? error.message : "Instagram upload failed.",
      });
    } finally {
      set({ instagramUploading: false });
    }
  },

  handleSuggestCaption: async (target) => {
    const { captionNiche, captionLang } = get();
    set({ captionSuggesting: true, captionSuggestTarget: target });
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/captions/suggest?niche=${encodeURIComponent(captionNiche)}&lang=${captionLang}`,
      );
      if (!res.ok) throw new Error("Failed to fetch caption suggestion");
      const data = (await res.json()) as { caption: string };
      const formatted = formatCaptionHashtags(data.caption);
      if (target === "facebook") {
        set({ facebookCaption: formatted });
      } else {
        set({ instagramCaption: formatted });
      }
    } catch (err) {
      console.error("Caption suggestion failed:", err);
    } finally {
      set({ captionSuggesting: false, captionSuggestTarget: null });
    }
  },

  handleSuggestNegativeCaption: async (target) => {
    const { captionNiche, captionLang } = get();
    set({ negativeCaptionSuggesting: true, negativeCaptionSuggestTarget: target });
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/captions/suggest/negative?niche=${encodeURIComponent(captionNiche)}&lang=${captionLang}`,
      );
      if (!res.ok) throw new Error("Failed to fetch negative caption suggestion");
      const data = (await res.json()) as { caption: string };
      const formatted = formatCaptionHashtags(data.caption);
      if (target === "facebook") {
        set({ facebookCaption: formatted });
      } else {
        set({ instagramCaption: formatted });
      }
    } catch (err) {
      console.error("Negative caption suggestion failed:", err);
    } finally {
      set({ negativeCaptionSuggesting: false, negativeCaptionSuggestTarget: null });
    }
  },

  markReelUploaded: async (reelId, uploaded, youtubeUrl) => {
    const response = await fetch(`${apiBaseUrl}/api/reels/${encodeURIComponent(reelId)}/uploaded`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploaded, youtubeUrl: uploaded ? youtubeUrl : undefined }),
    });
    if (!response.ok) throw new Error("Failed to update reel upload state");
    await get().loadReels();
  },

  handleMarkAllUploaded: async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/reels/mark-all-uploaded`, { method: "POST" });
      if (!response.ok) throw new Error("Failed to mark all uploaded");
      await get().loadReels();
      set({ youtubeMessage: "Existing reels flagged as uploaded." });
    } catch {
      set({ youtubeMessage: "Unable to mark existing reels." });
    }
  },

  handleOAuthConnectedRedirect: async (search) => {
    const params = new URLSearchParams(search);
    const connectedParam = params.get("connected");
    if (!connectedParam) return false;
    const [platform] = connectedParam.split(":");
    if (platform === "youtube") {
      set({ youtubeMessage: "YouTube account connected successfully." });
      await Promise.all([get().loadYoutubeStatus(), get().loadAllAccounts()]);
    } else if (platform === "facebook") {
      set({ facebookMessage: "Facebook/Instagram account connected successfully." });
      await Promise.all([get().loadFacebookStatus(), get().loadAllAccounts()]);
    }
    return true;
  },
}));
