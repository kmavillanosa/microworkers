import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import axios from 'axios'
import { existsSync } from 'node:fs'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import FormDataNode from 'form-data'
import { paths } from '../paths'
import { AccountsService } from '../accounts/accounts.service'
import type { FacebookCredentials, InstagramCredentials } from '../accounts/account.types'
import { ReelsService } from '../reels/reels.service'
import { CaptionsService } from '../captions/captions.service'
import { UploadFacebookDto } from './dto/upload-facebook.dto'
import { UploadFacebookPhotoDto } from './dto/upload-facebook-photo.dto'
import { ShareFacebookPostDto } from './dto/share-facebook-post.dto'

export interface FacebookPage {
  id: string
  name: string
  accessToken?: string
}

const FB_GRAPH = 'https://graph.facebook.com/v19.0'

const FACEBOOK_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'business_management', // required to list pages owned by a Business Account
].join(',')

const INSTAGRAM_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
].join(',')

/** Facebook Graph API limit for video description (/{page-id}/videos). */
const FACEBOOK_VIDEO_DESCRIPTION_MAX_LENGTH = 5000

/** Facebook error code for "post/comment limit" — user should try again later. */
const FACEBOOK_RATE_LIMIT_ERROR_CODE = 368

@Injectable()
export class FacebookService {
  private readonly pendingStates = new Map<string, string>()

  constructor(
    private readonly accountsService: AccountsService,
    private readonly reelsService: ReelsService,
  ) {}

  async getStatus() {
    const configured = this.hasOAuthConfig()
    const [facebookAccounts, instagramAccounts] = configured
      ? await Promise.all([
          this.accountsService.listByPlatform('facebook').then((list) =>
            list.map((a) => ({ id: a.id, label: a.label, connected: a.connected })),
          ),
          this.accountsService.listByPlatform('instagram').then((list) =>
            list.map((a) => ({ id: a.id, label: a.label, connected: a.connected })),
          ),
        ])
      : [[], []]
    return { configured, facebookAccounts, instagramAccounts }
  }

  async getAuthorizationUrl(accountId: string) {
    const account = await this.accountsService.findByIdOrThrow(accountId)
    if (account.platform !== 'facebook' && account.platform !== 'instagram') {
      throw new BadRequestException('Account must be facebook or instagram platform')
    }

    const appId = this.getAppId()
    const redirectUri = this.getRedirectUri()
    if (!appId || !redirectUri) {
      throw new BadRequestException(
        'Facebook OAuth is not configured. Set FB_APP_ID, FB_APP_SECRET, and FB_REDIRECT_URI.',
      )
    }

    const state = `${accountId}:${crypto.randomUUID()}`
    this.pendingStates.set(state, accountId)

    const scopes =
      account.platform === 'instagram' ? INSTAGRAM_SCOPES : FACEBOOK_SCOPES

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: scopes,
      response_type: 'code',
      state,
    })

    return { url: `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}` }
  }

  async handleOAuthCallback(code: string, state?: string) {
    if (!state || !this.pendingStates.has(state)) {
      throw new BadRequestException('Invalid OAuth state')
    }
    const accountId = this.pendingStates.get(state)!
    this.pendingStates.delete(state)

    const account = await this.accountsService.findByIdOrThrow(accountId)
    const appId = this.getAppId()
    const appSecret = this.getAppSecret()
    const redirectUri = this.getRedirectUri()

    const tokenParams = new URLSearchParams({
      client_id: appId!,
      client_secret: appSecret!,
      redirect_uri: redirectUri!,
      code,
    })

    const tokenRes = await fetch(
      `${FB_GRAPH}/oauth/access_token?${tokenParams.toString()}`,
    )
    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      throw new InternalServerErrorException(`Facebook token exchange failed: ${err}`)
    }
    const tokenData = (await tokenRes.json()) as {
      access_token: string
      token_type: string
      expires_in?: number
    }

    const longLived = await this.exchangeForLongLivedToken(
      tokenData.access_token,
      appId!,
      appSecret!,
    )

    const meRes = await fetch(
      `${FB_GRAPH}/me?fields=id,name&access_token=${longLived.access_token}`,
    )
    if (!meRes.ok) {
      throw new InternalServerErrorException('Failed to fetch Facebook user info')
    }
    const me = (await meRes.json()) as { id: string; name: string }

    if (account.platform === 'instagram') {
      // Resolve the linked Instagram business account
      const igAccount = await this.resolveInstagramAccount(me.id, longLived.access_token)
      const credentials: InstagramCredentials = {
        userAccessToken: longLived.access_token,
        userId: me.id,
        igAccountId: igAccount.id,
        username: igAccount.username,
        expiresAt: longLived.expires_in
          ? Date.now() + longLived.expires_in * 1000
          : undefined,
      }
      await this.accountsService.saveCredentials(accountId, credentials)
    } else {
      const credentials: FacebookCredentials = {
        userAccessToken: longLived.access_token,
        userId: me.id,
        expiresAt: longLived.expires_in
          ? Date.now() + longLived.expires_in * 1000
          : undefined,
      }
      await this.accountsService.saveCredentials(accountId, credentials)
    }

    return {
      redirectUrl: `${this.getWebRedirectUrl()}?connected=facebook:${accountId}`,
    }
  }

  async getPages(accountId: string): Promise<FacebookPage[]> {
    const credentials =
      await await this.accountsService.getCredentials<FacebookCredentials>(accountId)
    if (!credentials) {
      throw new BadRequestException('Facebook account not connected.')
    }

    const token = credentials.userAccessToken

    // 1. Pages the user manages directly (includes pages not moved to a Business)
    const res = await fetch(
      `${FB_GRAPH}/${credentials.userId}/accounts?fields=id,name,access_token&access_token=${token}`,
    )
    if (!res.ok) {
      const err = await res.text()
      throw new InternalServerErrorException(`Failed to fetch Facebook pages: ${err}`)
    }
    const data = (await res.json()) as {
      data: Array<{ id: string; name: string; access_token?: string }>
    }
    let pages: FacebookPage[] = (data.data ?? []).map((page) => ({
      id: page.id,
      name: page.name,
      accessToken: page.access_token,
    }))

    // 2. If no pages (e.g. all moved to Business Account), fetch via Business Management API
    if (pages.length === 0) {
      pages = await this.getPagesViaBusiness(credentials.userId, token)
    }

    return pages
  }

  /**
   * Fetch pages owned by Business Accounts the user has access to.
   * Used when /me/accounts returns empty (e.g. after moving pages to a Business).
   */
  private async getPagesViaBusiness(userId: string, accessToken: string): Promise<FacebookPage[]> {
    const businessesRes = await fetch(
      `${FB_GRAPH}/${userId}/businesses?fields=id,name&access_token=${accessToken}`,
    )
    if (!businessesRes.ok) return []

    const businessesData = (await businessesRes.json()) as {
      data?: Array<{ id: string; name: string }>
    }
    const businesses = businessesData.data ?? []
    const allPages: FacebookPage[] = []
    const seenIds = new Set<string>()

    for (const business of businesses) {
      const pagesRes = await fetch(
        `${FB_GRAPH}/${business.id}/owned_pages?fields=id,name,access_token&access_token=${accessToken}`,
      )
      if (!pagesRes.ok) continue
      const pagesData = (await pagesRes.json()) as {
        data?: Array<{ id: string; name: string; access_token?: string }>
      }
      const list = pagesData.data ?? []
      for (const page of list) {
        if (seenIds.has(page.id)) continue
        seenIds.add(page.id)
        allPages.push({
          id: page.id,
          name: page.name,
          accessToken: page.access_token,
        })
      }
    }
    return allPages
  }

  async uploadToFacebookPage(dto: UploadFacebookDto) {
    const credentials =
      await this.accountsService.getCredentials<FacebookCredentials>(dto.accountId)
    if (!credentials) {
      throw new BadRequestException(
        'Facebook account not connected. Authorize it first from Settings.',
      )
    }

    const videoPath = join(paths.outputDir, dto.reelId, 'reel.mp4')
    if (!existsSync(videoPath)) {
      throw new NotFoundException(`Reel video not found for id: ${dto.reelId}`)
    }

    let pages = await this.getPages(dto.accountId)
    if (dto.pageIds?.length) {
      const idSet = new Set(dto.pageIds)
      pages = pages.filter((p) => idSet.has(p.id))
    }
    if (pages.length === 0) {
      throw new BadRequestException(
        dto.pageIds?.length
          ? 'No matching Facebook Pages found for the selected page IDs. Check this pipeline\'s "Post to pages" setting.'
          : 'No Facebook Pages found for this account. Make sure you manage at least one page.',
      )
    }

    const successes: Array<{ pageId: string; pageName: string; videoId: string; url: string }> = []
    const failures: Array<{ pageId: string; pageName: string; error: string }> = []
    const skipped: Array<{ pageId: string; pageName: string }> = []

    for (const page of pages) {
      // Per-page duplicate guard — skip pages that already received this reel
      const alreadyOnPage = await this.reelsService.isAlreadyUploaded(
        dto.reelId, 'facebook', dto.accountId, page.id,
      )
      if (alreadyOnPage) {
        skipped.push({ pageId: page.id, pageName: page.name })
        continue
      }

      try {
        const pageToken =
          page.accessToken ??
          (await this.getPageAccessToken(page.id, credentials.userAccessToken))

        const description = CaptionsService.prepareCaptionForPost(dto.caption ?? '')
        const descriptionTrimmed =
          description.length > FACEBOOK_VIDEO_DESCRIPTION_MAX_LENGTH
            ? description.slice(0, FACEBOOK_VIDEO_DESCRIPTION_MAX_LENGTH - 3) + '...'
            : description

        const form = new FormDataNode()
        form.append('source', createReadStream(videoPath), {
          filename: 'reel.mp4',
          contentType: 'video/mp4',
        })
        form.append('description', descriptionTrimmed)
        form.append('access_token', pageToken)

        const uploadRes = await axios.post<{ id: string }>(
          `${FB_GRAPH}/${page.id}/videos`,
          form,
          {
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          },
        )

        const uploaded = uploadRes.data
        const facebookUrl = `https://www.facebook.com/${page.id}/videos/${uploaded.id}/`
        successes.push({
          pageId: page.id,
          pageName: page.name,
          videoId: uploaded.id,
          url: facebookUrl,
        })

        // Record immediately per page so partial failures don't cause re-uploads to succeeded pages
        await this.reelsService.recordUpload(
          dto.reelId, 'facebook', dto.accountId, facebookUrl, page.id,
        )
      } catch (err) {
        failures.push({
          pageId: page.id,
          pageName: page.name,
          error: this.getFacebookApiErrorMessage(err),
        })
      }
    }

    // All pages were either already uploaded or just uploaded — nothing new to do
    if (successes.length === 0 && failures.length === 0) {
      throw new BadRequestException(
        `This reel has already been uploaded to all pages for this account.`,
      )
    }

    if (successes.length === 0 && failures.length > 0) {
      const detail = failures.map((f) => `${f.pageName}: ${f.error}`).join(' | ')
      const isRateLimit = failures.some(
        (f) => f.error.includes(`code ${FACEBOOK_RATE_LIMIT_ERROR_CODE})`) ||
          /try again later|limit how often/i.test(f.error),
      )
      throw new InternalServerErrorException(
        isRateLimit
          ? `Facebook rate limit: post less often and try again later. ${detail}`
          : `Failed to upload to all pages. ${detail}`,
      )
    }

    return {
      videoId: successes[0]?.videoId,
      facebookUrl: successes[0]?.url ?? skipped[0] ? `(already uploaded)` : '',
      facebookUrls: successes.map((s) => s.url),
      uploadedPages: successes.map((s) => ({ id: s.pageId, name: s.pageName })),
      skippedPages: skipped,
      failedPages: failures,
      partial: failures.length > 0,
    }
  }

  /**
   * Post a photo to the Facebook Page using a public image URL (e.g. from RSS feed).
   * Uses Graph API POST /{page-id}/photos with url + message. All managed pages receive the post.
   */
  async uploadPhotoToFacebookPage(dto: UploadFacebookPhotoDto) {
    const credentials =
      await this.accountsService.getCredentials<FacebookCredentials>(dto.accountId)
    if (!credentials) {
      throw new BadRequestException(
        'Facebook account not connected. Authorize it first from Settings.',
      )
    }

    let pages = await this.getPages(dto.accountId)
    if (dto.pageIds?.length) {
      const idSet = new Set(dto.pageIds)
      pages = pages.filter((p) => idSet.has(p.id))
    }
    if (pages.length === 0) {
      throw new BadRequestException(
        dto.pageIds?.length
          ? 'No matching Facebook Pages found for the selected page IDs. Check this pipeline\'s "Post to pages" setting.'
          : 'No Facebook Pages found for this account. Make sure you manage at least one page.',
      )
    }

    const successes: Array<{ pageId: string; pageName: string; postId: string; url: string }> = []
    const failures: Array<{ pageId: string; pageName: string; error: string }> = []

    for (const page of pages) {
      try {
        const pageToken =
          page.accessToken ??
          (await this.getPageAccessToken(page.id, credentials.userAccessToken))

        const body = new URLSearchParams({
          url: dto.imageUrl,
          message: CaptionsService.prepareCaptionForPost(dto.caption),
          access_token: pageToken,
        })
        const res = await fetch(`${FB_GRAPH}/${page.id}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        })
        if (!res.ok) {
          const err = await res.text()
          throw new Error(err)
        }
        const data = (await res.json()) as { id: string; post_id?: string }
        const postId = data.post_id ?? data.id
        const facebookUrl = `https://www.facebook.com/${postId}`
        successes.push({
          pageId: page.id,
          pageName: page.name,
          postId,
          url: facebookUrl,
        })
      } catch (err) {
        failures.push({
          pageId: page.id,
          pageName: page.name,
          error: this.getFacebookApiErrorMessage(err),
        })
      }
    }

    if (successes.length === 0) {
      const detail = failures.map((f) => `${f.pageName}: ${f.error}`).join(' | ')
      const isRateLimit = failures.some(
        (f) => f.error.includes(`code ${FACEBOOK_RATE_LIMIT_ERROR_CODE})`) ||
          /try again later|limit how often/i.test(f.error),
      )
      throw new InternalServerErrorException(
        isRateLimit
          ? `Facebook rate limit: post less often and try again later. ${detail}`
          : `Failed to post photo to all pages. ${detail}`,
      )
    }

    return {
      postId: successes[0]?.postId,
      facebookUrl: successes[0]?.url ?? '',
      facebookUrls: successes.map((s) => s.url),
      uploadedPages: successes.map((s) => ({ id: s.pageId, name: s.pageName })),
      failedPages: failures,
      partial: failures.length > 0,
    }
  }

  async uploadToInstagram(dto: UploadFacebookDto) {
    const credentials =
      await this.accountsService.getCredentials<InstagramCredentials>(dto.accountId)
    if (!credentials) {
      throw new BadRequestException(
        'Instagram account not connected. Authorize it first from Settings.',
      )
    }

    const videoPath = join(paths.outputDir, dto.reelId, 'reel.mp4')
    if (!existsSync(videoPath)) {
      throw new NotFoundException(`Reel video not found for id: ${dto.reelId}`)
    }

    // Duplicate upload guard
    const alreadyUploaded = await this.reelsService.isAlreadyUploaded(
      dto.reelId, 'instagram', dto.accountId,
    )
    if (alreadyUploaded) {
      throw new BadRequestException(
        `This reel has already been uploaded to this Instagram account. Mark it as not uploaded first if you want to re-upload.`,
      )
    }

    const videoPublicUrl = `${this.getApiBaseUrl()}/media/output/${dto.reelId}/reel.mp4`
    const igAccountId = credentials.igAccountId

    const containerRes = await fetch(`${FB_GRAPH}/${igAccountId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: 'REELS',
        video_url: videoPublicUrl,
        caption: CaptionsService.prepareCaptionForPost(dto.caption ?? ''),
        share_to_feed: true,
        access_token: credentials.userAccessToken,
      }),
    })
    if (!containerRes.ok) {
      const err = await containerRes.text()
      throw new InternalServerErrorException(
        `Failed to create Instagram media container: ${err}`,
      )
    }
    const container = (await containerRes.json()) as { id: string }

    await this.waitForContainerReady(container.id, credentials.userAccessToken)

    const publishRes = await fetch(`${FB_GRAPH}/${igAccountId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: container.id,
        access_token: credentials.userAccessToken,
      }),
    })
    if (!publishRes.ok) {
      const err = await publishRes.text()
      throw new InternalServerErrorException(`Failed to publish Instagram Reel: ${err}`)
    }
    const published = (await publishRes.json()) as { id: string }
    const instagramUrl = `https://www.instagram.com/p/${published.id}/`

    // Record this upload to prevent duplicates
    await this.reelsService.recordUpload(dto.reelId, 'instagram', dto.accountId, instagramUrl)

    return { mediaId: published.id, instagramUrl }
  }

  /**
   * Share an existing post URL to other managed pages for the same connected account.
   * Limitation: can only post to pages this account can manage.
   */
  async sharePostToManagedPages(dto: ShareFacebookPostDto) {
    const credentials =
      await this.accountsService.getCredentials<FacebookCredentials>(dto.accountId)
    if (!credentials) {
      throw new BadRequestException(
        'Facebook account not connected. Authorize it first from Settings.',
      )
    }

    const pages = await this.getPages(dto.accountId)
    if (pages.length === 0) {
      throw new BadRequestException(
        'No Facebook Pages found for this account. Make sure you manage at least one page.',
      )
    }

    const allowedPageIds = new Set(pages.map((p) => p.id))
    const targetIds = (dto.targetPageIds?.length
      ? dto.targetPageIds.filter((id) => allowedPageIds.has(id))
      : pages.map((p) => p.id)
    ).filter((id) => id !== dto.sourcePageId)

    if (targetIds.length === 0) {
      throw new BadRequestException('No target pages to share to.')
    }

    const successes: Array<{ pageId: string; pageName: string; postId: string; url: string }> = []
    const failures: Array<{ pageId: string; pageName: string; error: string }> = []

    for (const pageId of targetIds) {
      const page = pages.find((p) => p.id === pageId)
      if (!page) continue
      try {
        const pageToken =
          page.accessToken ??
          (await this.getPageAccessToken(page.id, credentials.userAccessToken))

        const body = new URLSearchParams({
          link: dto.postUrl,
          message: dto.message ?? '',
          access_token: pageToken,
        })
        const res = await fetch(`${FB_GRAPH}/${page.id}/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        })
        if (!res.ok) {
          throw new Error(await res.text())
        }
        const data = (await res.json()) as { id: string }
        successes.push({
          pageId: page.id,
          pageName: page.name,
          postId: data.id,
          url: `https://www.facebook.com/${data.id}`,
        })
      } catch (err) {
        failures.push({
          pageId: page.id,
          pageName: page.name,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    if (successes.length === 0) {
      throw new InternalServerErrorException(
        `Failed to share to all target pages. ${failures.map((f) => `${f.pageName}: ${f.error}`).join(' | ')}`,
      )
    }

    return {
      sharedPages: successes.map((s) => ({ id: s.pageId, name: s.pageName })),
      sharedUrls: successes.map((s) => s.url),
      failedPages: failures,
      partial: failures.length > 0,
    }
  }

  private async resolveInstagramAccount(
    userId: string,
    accessToken: string,
  ): Promise<{ id: string; username: string }> {
    const pagesRes = await fetch(
      `${FB_GRAPH}/${userId}/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${accessToken}`,
    )
    if (!pagesRes.ok) {
      throw new InternalServerErrorException('Failed to fetch pages for Instagram resolution')
    }
    const pages = (await pagesRes.json()) as {
      data: Array<{
        id: string
        instagram_business_account?: { id: string; username: string }
      }>
    }
    const page = pages.data.find((p) => p.instagram_business_account)
    if (!page?.instagram_business_account) {
      throw new BadRequestException(
        'No Instagram Business account linked to this Facebook account.',
      )
    }
    return page.instagram_business_account
  }

  private async waitForContainerReady(
    containerId: string,
    accessToken: string,
    maxAttempts = 20,
    intervalMs = 5000,
  ) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const statusRes = await fetch(
        `${FB_GRAPH}/${containerId}?fields=status_code,status&access_token=${accessToken}`,
      )
      if (!statusRes.ok) {
        throw new InternalServerErrorException('Failed to check container status')
      }
      const status = (await statusRes.json()) as {
        status_code: string
        status?: string
      }
      if (status.status_code === 'FINISHED') return
      if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
        throw new InternalServerErrorException(
          `Instagram container processing failed: ${status.status ?? status.status_code}`,
        )
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
    throw new InternalServerErrorException(
      'Instagram container processing timed out. Try again later.',
    )
  }

  /**
   * Extract a readable error message from Facebook API / axios errors.
   * Surfaces Facebook's error.message when present so 400s show the real reason.
   */
  private getFacebookApiErrorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'response' in err) {
      const res = (err as { response?: { data?: unknown; status?: number } }).response
      if (res?.data && typeof res.data === 'object' && res.data !== null && 'error' in res.data) {
        const fb = (res.data as { error?: { message?: string; code?: number } }).error
        if (fb?.message) {
          return `Facebook API ${res.status ?? 400}: ${fb.message}${fb.code != null ? ` (code ${fb.code})` : ''}`
        }
      }
      if (res?.data && typeof res.data === 'object' && res.data !== null) {
        try {
          const text = JSON.stringify(res.data)
          if (text.length <= 500) return `Facebook API ${res.status ?? 400}: ${text}`
        } catch {
          // ignore
        }
      }
    }
    return err instanceof Error ? err.message : String(err)
  }

  private async getPageAccessToken(
    pageId: string,
    userAccessToken: string,
  ): Promise<string> {
    const res = await fetch(
      `${FB_GRAPH}/${pageId}?fields=access_token&access_token=${userAccessToken}`,
    )
    if (!res.ok) {
      const err = await res.text()
      throw new InternalServerErrorException(`Failed to get page access token: ${err}`)
    }
    const data = (await res.json()) as { access_token?: string }
    if (!data.access_token) {
      throw new InternalServerErrorException(
        'Page access token not returned. Ensure the app has pages_manage_posts permission.',
      )
    }
    return data.access_token
  }

  private async exchangeForLongLivedToken(
    shortLivedToken: string,
    appId: string,
    appSecret: string,
  ) {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    })
    const res = await fetch(`${FB_GRAPH}/oauth/access_token?${params.toString()}`)
    if (!res.ok) {
      const err = await res.text()
      throw new InternalServerErrorException(
        `Failed to exchange for long-lived token: ${err}`,
      )
    }
    return (await res.json()) as { access_token: string; expires_in?: number }
  }

  private hasOAuthConfig() {
    return Boolean(this.getAppId() && this.getAppSecret() && this.getRedirectUri())
  }

  private getAppId() {
    return process.env.FB_APP_ID
  }

  private getAppSecret() {
    return process.env.FB_APP_SECRET
  }

  private getRedirectUri() {
    return process.env.FB_REDIRECT_URI ?? 'http://localhost:3010/api/facebook/callback'
  }

  private getWebRedirectUrl() {
    return process.env.YOUTUBE_WEB_REDIRECT_URL ?? 'http://localhost:5173'
  }

  private getApiBaseUrl() {
    return process.env.API_BASE_URL ?? 'http://localhost:3010'
  }
}
