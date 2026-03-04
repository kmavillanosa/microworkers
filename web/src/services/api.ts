import { cachedFetch, clearCacheForUrl } from "../cachedFetch";
import type {
  ClipItem,
  ClipTranscriptInfo,
  FontsResponse,
  NicheItem,
  Pipeline,
  ReelItem,
  SocialAccount,
  VoicesResponse,
} from "../types";

/**
 * API Services for data loading and mutations
 */

export const apiConfig = {
  /** Local API (backoffice talks to this for orders, Generate reel, etc.). */
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3010",

  /** VPS API (customer orders, receipts, worker uploads). Set when you need to reference VPS (e.g. receipt links). */
  apiVpsBaseUrl: import.meta.env.VITE_API_VPS_BASE_URL ?? "",

  appEnv: (import.meta.env.VITE_APP_ENV ?? "local").toLowerCase(),
  get envLabel() {
    return this.appEnv === "production"
      ? "production"
      : this.appEnv === "dev"
        ? "dev"
        : "local";
  },
};

// ============================================================================
// Clips
// ============================================================================

export async function loadClips(baseUrl: string): Promise<ClipItem[]> {
  try {
    const response = await cachedFetch(`${baseUrl}/api/clips`, {
      ttl: 15000,
    });
    if (!response.ok) return [];
    const data = (await response.json()) as ClipItem[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function loadGameClips(baseUrl: string): Promise<ClipItem[]> {
  try {
    const response = await cachedFetch(`${baseUrl}/api/game-clips`, {
      ttl: 15000,
    });
    if (!response.ok) return [];
    const data = (await response.json()) as ClipItem[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function loadOrderClips(baseUrl: string): Promise<ClipItem[]> {
  try {
    const response = await cachedFetch(`${baseUrl}/api/order-clips`, {
      ttl: 15000,
    });
    if (!response.ok) return [];
    const data = (await response.json()) as ClipItem[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function loadOrderClipTranscripts(
  baseUrl: string,
  clipNames: string[]
): Promise<Record<string, ClipTranscriptInfo>> {
  try {
    const results = await Promise.all(
      clipNames.map(async (clipName) => {
        const res = await fetch(
          `${baseUrl}/api/order-clips/${encodeURIComponent(clipName)}/transcript`
        );
        if (!res.ok) return [clipName, null] as const;
        const data = (await res.json()) as ClipTranscriptInfo;
        return [clipName, data] as const;
      })
    );
    const transcripts: Record<string, ClipTranscriptInfo> = {};
    results.forEach(([clipName, data]) => {
      if (data) transcripts[clipName] = data;
    });
    return transcripts;
  } catch {
    return {};
  }
}

// ============================================================================
// Voices
// ============================================================================

export async function loadVoices(baseUrl: string): Promise<VoicesResponse> {
  const response = await cachedFetch(`${baseUrl}/api/reels/voices`, {
    ttl: 30000,
  });
  if (!response.ok) throw new Error("Failed to load voices");
  return (await response.json()) as VoicesResponse & {
    defaultVoiceId?: string;
  };
}

// ============================================================================
// Fonts
// ============================================================================

export async function loadFonts(baseUrl: string): Promise<FontsResponse> {
  try {
    const response = await cachedFetch(`${baseUrl}/api/reels/fonts`, {
      ttl: 30000,
    });
    if (!response.ok) return { defaultFont: "default", items: [] };
    return (await response.json()) as FontsResponse;
  } catch {
    return { defaultFont: "default", items: [] };
  }
}

export async function uploadFont(
  baseUrl: string,
  file: File,
  fontName: string
): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", fontName);

  const res = await fetch(`${baseUrl}/api/reels/fonts`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to upload font");
  clearCacheForUrl(`${baseUrl}/api/reels/fonts`);
}

export async function updateFont(
  baseUrl: string,
  id: string,
  name: string
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/reels/fonts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to update font");
  clearCacheForUrl(`${baseUrl}/api/reels/fonts`);
}

export async function deleteFont(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/reels/fonts/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete font");
  clearCacheForUrl(`${baseUrl}/api/reels/fonts`);
}

// ============================================================================
// Reels
// ============================================================================

export async function loadReels(baseUrl: string): Promise<ReelItem[]> {
  const response = await cachedFetch(`${baseUrl}/api/reels`, {
    ttl: 5000,
  });
  if (!response.ok) throw new Error("Failed to load reels");
  return (await response.json()) as ReelItem[];
}

export async function markReelUploaded(
  baseUrl: string,
  reelId: string,
  platform: string,
  url: string
): Promise<void> {
  const res = await fetch(
    `${baseUrl}/api/reels/${reelId}/mark-uploaded?platform=${encodeURIComponent(platform)}&url=${encodeURIComponent(url)}`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error("Failed to mark reel as uploaded");
}

export async function saveReelShowcase(
  baseUrl: string,
  reelId: string,
  title: string,
  description: string
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/reels/${reelId}/showcase`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description }),
  });
  if (!res.ok) throw new Error("Failed to save showcase");
}

export async function deleteReelShowcase(
  baseUrl: string,
  reelId: string
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/reels/${reelId}/showcase`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete showcase");
}

// ============================================================================
// Social Accounts
// ============================================================================

export async function loadAllAccounts(baseUrl: string): Promise<SocialAccount[]> {
  try {
    const response = await cachedFetch(`${baseUrl}/api/accounts`, {
      ttl: 30000,
    });
    if (!response.ok) throw new Error("Failed to load accounts");
    return (await response.json()) as SocialAccount[];
  } catch {
    return [];
  }
}

export async function addAccount(
  baseUrl: string,
  platform: string,
  label: string
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform, label }),
  });
  if (!res.ok) throw new Error("Failed to add account");
  clearCacheForUrl(`${baseUrl}/api/accounts`);
}

export async function connectAccount(
  baseUrl: string,
  accountId: string,
  platform: string
): Promise<{ authUrl: string }> {
  const res = await fetch(
    `${baseUrl}/api/accounts/${accountId}/connect?platform=${encodeURIComponent(platform)}`
  );
  if (!res.ok) throw new Error("Failed to get auth URL");
  return (await res.json()) as { authUrl: string };
}

export async function disconnectAccount(
  baseUrl: string,
  accountId: string
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/accounts/${accountId}/disconnect`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to disconnect account");
  clearCacheForUrl(`${baseUrl}/api/accounts`);
}

export async function deleteAccount(
  baseUrl: string,
  accountId: string
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/accounts/${accountId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete account");
  clearCacheForUrl(`${baseUrl}/api/accounts`);
}

// ============================================================================
// Niches
// ============================================================================

export async function loadNiches(baseUrl: string): Promise<NicheItem[]> {
  try {
    const res = await cachedFetch(`${baseUrl}/api/captions/niches`, {
      ttl: 30000,
    });
    if (!res.ok) return [];
    return (await res.json()) as NicheItem[];
  } catch {
    return [];
  }
}

export async function addNiche(
  baseUrl: string,
  label: string,
  keywords: string,
  feeds: string[]
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/captions/niches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, keywords, rssFeeds: feeds }),
  });
  if (!res.ok) throw new Error("Failed to add niche");
  clearCacheForUrl(`${baseUrl}/api/captions/niches`);
}

export async function updateNiche(
  baseUrl: string,
  id: string,
  label: string,
  keywords: string,
  feeds: string[]
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/captions/niches/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, keywords, rssFeeds: feeds }),
  });
  if (!res.ok) throw new Error("Failed to update niche");
  clearCacheForUrl(`${baseUrl}/api/captions/niches`);
}

export async function deleteNiche(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/captions/niches/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete niche");
  clearCacheForUrl(`${baseUrl}/api/captions/niches`);
}

// ============================================================================
// Pipelines
// ============================================================================

export async function loadPipelines(baseUrl: string): Promise<{
  pipelines: Pipeline[];
  runningIds: Set<string>;
}> {
  try {
    const res = await cachedFetch(`${baseUrl}/api/pipeline`, {
      ttl: 5000,
    });
    if (!res.ok) return { pipelines: [], runningIds: new Set() };
    const list = (await res.json()) as Pipeline[];

    // Refresh running status per pipeline
    const runningIds = new Set<string>();
    await Promise.all(
      list.map(async (p) => {
        try {
          const sr = await cachedFetch(
            `${baseUrl}/api/pipeline/${p.id}/status`,
            { ttl: 3000 }
          );
          if (sr.ok) {
            const s = (await sr.json()) as Pipeline & { isRunning: boolean };
            if (s.isRunning) runningIds.add(p.id);
          }
        } catch {
          /* non-fatal */
        }
      })
    );
    return { pipelines: list, runningIds };
  } catch {
    return { pipelines: [], runningIds: new Set() };
  }
}

export async function savePipeline(
  baseUrl: string,
  id: string,
  data: Partial<Pipeline>
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/pipeline/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save");
  clearCacheForUrl(`${baseUrl}/api/pipeline`);
}

export async function createPipeline(
  baseUrl: string,
  data: Partial<Pipeline> & { label: string }
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create");
  clearCacheForUrl(`${baseUrl}/api/pipeline`);
}

export async function deletePipeline(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/pipeline/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete");
  clearCacheForUrl(`${baseUrl}/api/pipeline`);
}

export async function runPipeline(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/pipeline/${id}/run`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to trigger");
}

export async function stopPipeline(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/pipeline/${id}/stop`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to stop");
}

export async function getPaymentMethods(
  baseUrl: string
): Promise<Array<{ id: string; label: string }>> {
  const res = await fetch(`${baseUrl}/api/payment-methods`);
  if (!res.ok) return [];
  return (await res.json()) as Array<{ id: string; label: string }>;
}

export async function getEnabledPaymentMethods(baseUrl: string): Promise<string[]> {
  const res = await fetch(`${baseUrl}/api/payment-methods/enabled`);
  if (!res.ok) return [];
  return (await res.json()) as string[];
}

export async function setPaymentMethods(
  baseUrl: string,
  methods: string[]
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/payment-methods/enabled`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: methods }),
  });
  if (!res.ok) throw new Error("Failed to set payment methods");
}
