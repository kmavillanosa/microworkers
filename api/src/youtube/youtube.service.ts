import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { createReadStream } from 'node:fs'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { google } from 'googleapis'
import { paths } from '../paths'
import { AccountsService } from '../accounts/accounts.service'
import type { YoutubeCredentials } from '../accounts/account.types'
import { ReelsService } from '../reels/reels.service'
import { UploadYoutubeDto } from './dto/upload-youtube.dto'

@Injectable()
export class YoutubeService {
  // Maps OAuth state token -> accountId so the callback knows which DB row to update
  private readonly pendingStates = new Map<string, string>()

  constructor(
    private readonly accountsService: AccountsService,
    private readonly reelsService: ReelsService,
  ) {}

  async getStatus() {
    const configured = this.hasOAuthConfig()
    const accounts = configured
      ? (await this.accountsService.listByPlatform('youtube')).map((a) => ({
          id: a.id,
          label: a.label,
          connected: a.connected,
        }))
      : []
    return { configured, accounts }
  }

  async getAuthorizationUrl(accountId: string) {
    const account = await this.accountsService.findByIdOrThrow(accountId)
    if (account.platform !== 'youtube') {
      throw new BadRequestException('Account is not a YouTube account')
    }

    const client = this.createOAuthClientOrThrow()
    const state = `${accountId}:${crypto.randomUUID()}`
    this.pendingStates.set(state, accountId)

    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/youtube.upload'],
      state,
    })
    return { url }
  }

  async handleOAuthCallback(code: string, state?: string) {
    if (!state || !this.pendingStates.has(state)) {
      throw new BadRequestException('Invalid OAuth state')
    }
    const accountId = this.pendingStates.get(state)!
    this.pendingStates.delete(state)

    const client = this.createOAuthClientOrThrow()
    const tokenResponse = await client.getToken(code)
    const tokens = tokenResponse.tokens

    const credentials: YoutubeCredentials = {
      access_token: tokens.access_token ?? undefined,
      refresh_token: tokens.refresh_token ?? undefined,
      scope: tokens.scope ?? undefined,
      token_type: tokens.token_type ?? undefined,
      expiry_date: tokens.expiry_date ?? undefined,
    }

    await this.accountsService.saveCredentials(accountId, credentials)

    return {
      redirectUrl: `${this.getWebRedirectUrl()}?connected=youtube:${accountId}`,
    }
  }

  async uploadReel(dto: UploadYoutubeDto) {
    const reelFolder = join(paths.outputDir, dto.reelId)
    const videoPath = join(reelFolder, 'reel.mp4')

    if (!(await this.fileExists(videoPath))) {
      throw new NotFoundException(`Reel video not found for id: ${dto.reelId}`)
    }

    // Duplicate upload guard
    const alreadyUploaded = await this.reelsService.isAlreadyUploaded(
      dto.reelId, 'youtube', dto.accountId,
    )
    if (alreadyUploaded) {
      throw new BadRequestException(
        `This reel has already been uploaded to this YouTube account.`,
      )
    }

    const authClient = await this.getAuthedClient(dto.accountId)
    const youtube = google.youtube({ version: 'v3', auth: authClient })

    const tags = (dto.tags ?? [])
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 30)

    const upload = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: dto.title,
          description: dto.description ?? '',
          tags,
          categoryId: '20',
        },
        status: {
          privacyStatus: dto.privacyStatus ?? 'private',
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: createReadStream(videoPath),
      },
    })

    const videoId = upload.data.id
    if (!videoId) {
      throw new InternalServerErrorException('Upload succeeded but no video ID returned')
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`

    // Record this upload to prevent duplicates
    await this.reelsService.recordUpload(dto.reelId, 'youtube', dto.accountId, youtubeUrl)

    return { videoId, youtubeUrl }
  }

  private hasOAuthConfig() {
    return Boolean(
      process.env.YOUTUBE_CLIENT_ID &&
        process.env.YOUTUBE_CLIENT_SECRET &&
        this.getRedirectUri(),
    )
  }

  private createOAuthClientOrThrow() {
    const clientId = process.env.YOUTUBE_CLIENT_ID
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET
    const redirectUri = this.getRedirectUri()
    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException(
        'YouTube OAuth is not configured. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REDIRECT_URI.',
      )
    }
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  }

  private async getAuthedClient(accountId: string) {
    const credentials = await this.accountsService.getCredentials<YoutubeCredentials>(accountId)
    if (!credentials) {
      throw new BadRequestException(
        `YouTube account "${accountId}" is not connected. Authorize it first from Settings.`,
      )
    }

    const client = this.createOAuthClientOrThrow()
    client.setCredentials(credentials)

    // Persist refreshed tokens back to DB
    client.on('tokens', async (tokens) => {
      const updated: YoutubeCredentials = {
        ...credentials,
        access_token: tokens.access_token ?? credentials.access_token,
        refresh_token: tokens.refresh_token ?? credentials.refresh_token,
        expiry_date: tokens.expiry_date ?? credentials.expiry_date,
      }
      await this.accountsService.saveCredentials(accountId, updated)
    })

    return client
  }

  private getRedirectUri() {
    return process.env.YOUTUBE_REDIRECT_URI ?? 'http://localhost:3010/api/youtube/callback'
  }

  private getWebRedirectUrl() {
    return process.env.YOUTUBE_WEB_REDIRECT_URL ?? 'http://localhost:5173'
  }

  private async fileExists(path: string) {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  }
}
