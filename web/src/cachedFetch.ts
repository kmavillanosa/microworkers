/**
 * In-memory cache for GET requests to reduce duplicate calls and server load.
 * Use for read-only endpoints (jobs, orders, reels, settings, etc.).
 */

const cache = new Map<
  string,
  { body: string; status: number; timestamp: number }
>();

export type CachedFetchOptions = RequestInit & { ttl?: number };

/**
 * Fetch with optional caching. For GET requests, pass `ttl` (ms) to cache the response.
 * Same URL within TTL returns the cached response without hitting the server.
 */
export async function cachedFetch(
  url: string,
  options: CachedFetchOptions = {},
): Promise<Response> {
  const { ttl, ...init } = options;
  const method = (init.method ?? "GET").toUpperCase();
  const shouldCache = (method === "GET" || !init.method) && ttl != null && ttl > 0;

  if (shouldCache) {
    const entry = cache.get(url);
    if (entry && Date.now() - entry.timestamp < ttl) {
      return new Response(entry.body, {
        status: entry.status,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const res = await fetch(url, init);
  if (shouldCache && res.ok) {
    try {
      const clone = res.clone();
      const body = await clone.text();
      cache.set(url, { body, status: res.status, timestamp: Date.now() });
    } catch {
      // ignore cache write errors
    }
  }
  return res;
}

/** Clear cache (e.g. after a mutation so next read is fresh). */
export function clearCache(): void {
  cache.clear();
}

/** Clear cache entry for a single URL or URLs that start with prefix. */
export function clearCacheForUrl(urlOrPrefix: string): void {
  if (cache.has(urlOrPrefix)) {
    cache.delete(urlOrPrefix);
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(urlOrPrefix)) cache.delete(key);
  }
}
