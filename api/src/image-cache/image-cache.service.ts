import { Injectable, Logger } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { paths } from '../paths'

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const

/**
 * Returns a stable cache key (hash) for a URL.
 */
function cacheKeyForUrl(url: string): string {
  return createHash('sha256').update(url.trim()).digest('hex')
}

export interface CachedImageResult {
  path: string
  contentType: string
}

@Injectable()
export class ImageCacheService {
  private readonly logger = new Logger(ImageCacheService.name)

  constructor() {
    this.ensureDir().catch((err) =>
      this.logger.warn('Image cache dir creation failed', err),
    )
  }

  private async ensureDir(): Promise<void> {
    await mkdir(paths.imageCacheDir, { recursive: true })
  }

  /**
   * Returns the local path and content-type if the URL is already cached.
   */
  async getCached(url: string): Promise<CachedImageResult | null> {
    await this.ensureDir()
    const key = cacheKeyForUrl(url)
    const dataPath = join(paths.imageCacheDir, key)
    const metaPath = join(paths.imageCacheDir, `${key}.meta`)
    try {
      const [metaBuf, statData] = await Promise.all([
        readFile(metaPath, 'utf-8').catch(() => null),
        stat(dataPath).catch(() => null),
      ])
      if (!metaBuf || !statData?.isFile()) return null
      const contentType = metaBuf.trim() || 'application/octet-stream'
      return { path: dataPath, contentType }
    } catch {
      return null
    }
  }

  /**
   * Downloads the image from url if not in cache, stores it, and returns the local path and content-type.
   */
  async getOrFetch(url: string): Promise<CachedImageResult> {
    const cached = await this.getCached(url)
    if (cached) return cached

    await this.ensureDir()
    const key = cacheKeyForUrl(url)
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Microworkers-ImageCache/1.0' },
    })
    if (!response.ok) {
      throw new Error(`Image fetch failed: ${response.status} ${url}`)
    }
    const contentType = (response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    if (!ALLOWED_CONTENT_TYPES.includes(contentType as (typeof ALLOWED_CONTENT_TYPES)[number])) {
      throw new Error(`Unsupported image type: ${contentType}`)
    }
    const dataPath = join(paths.imageCacheDir, key)
    const metaPath = join(paths.imageCacheDir, `${key}.meta`)
    const bytes = await response.arrayBuffer()
    await Promise.all([
      writeFile(dataPath, Buffer.from(bytes)),
      writeFile(metaPath, contentType),
    ])
    this.logger.log(`Cached image: ${url.slice(0, 60)}... -> ${key}`)
    return { path: dataPath, contentType }
  }
}
