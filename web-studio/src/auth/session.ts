import type { StudioAuthSession } from '../api/types'

const STUDIO_AUTH_SESSION_STORAGE_KEY = 'web-studio-auth-session'

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function getStoredStudioAuthSession(): StudioAuthSession | null {
  const storage = getBrowserStorage()
  if (!storage) {
    return null
  }

  const raw = storage.getItem(STUDIO_AUTH_SESSION_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as StudioAuthSession
    if (typeof parsed?.accessToken !== 'string' || parsed.accessToken.trim().length === 0) {
      return null
    }

    return {
      accessToken: parsed.accessToken,
      user: parsed.user,
    }
  } catch {
    return null
  }
}

export function getStoredStudioAccessToken(): string | null {
  const session = getStoredStudioAuthSession()
  const accessToken = session?.accessToken?.trim()
  return accessToken ? accessToken : null
}

export function saveStudioAuthSession(session: StudioAuthSession): void {
  const storage = getBrowserStorage()
  if (!storage) {
    return
  }

  storage.setItem(STUDIO_AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearStudioAuthSession(): void {
  const storage = getBrowserStorage()
  if (!storage) {
    return
  }

  storage.removeItem(STUDIO_AUTH_SESSION_STORAGE_KEY)
}
