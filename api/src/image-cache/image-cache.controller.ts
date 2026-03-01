import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common'
import { createReadStream } from 'node:fs'
import type { Response } from 'express'
import { ImageCacheService } from './image-cache.service'

@Controller('api/cache-image')
export class ImageCacheController {
  constructor(private readonly imageCache: ImageCacheService) {}

  /**
   * GET /api/cache-image?url=<encoded-image-url>
   * Fetches the image from the URL if not already cached, then serves it.
   * Use as img src to avoid repeated downloads and save bandwidth.
   */
  @Get()
  async getCachedImage(
    @Query('url') url: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!url || typeof url !== 'string') {
      throw new BadRequestException('Query "url" is required')
    }
    let decoded: string
    try {
      decoded = decodeURIComponent(url.trim())
    } catch {
      throw new BadRequestException('Invalid url parameter')
    }
    if (!decoded.startsWith('http://') && !decoded.startsWith('https://')) {
      throw new BadRequestException('url must be http or https')
    }
    const { path: filePath, contentType } =
      await this.imageCache.getOrFetch(decoded)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400') // 24h browser cache
    const stream = createReadStream(filePath)
    stream.pipe(res)
  }
}
