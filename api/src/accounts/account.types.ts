export type Platform = 'youtube' | 'facebook' | 'instagram'

export interface SocialAccount {
  id: string
  platform: Platform
  label: string
  credentials: string | null
  connected: boolean
  createdAt: string
}

export interface YoutubeCredentials {
  access_token?: string
  refresh_token?: string
  scope?: string
  token_type?: string
  expiry_date?: number
}

export interface FacebookCredentials {
  userAccessToken: string
  userId: string
  expiresAt?: number
}

export interface InstagramCredentials {
  userAccessToken: string
  userId: string
  igAccountId: string
  username: string
  expiresAt?: number
}
