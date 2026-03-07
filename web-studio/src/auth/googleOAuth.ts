type GoogleTokenResponse = {
  access_token?: string
  error?: string
  error_description?: string
}

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: '' | 'consent' }) => void
}

type GoogleOauth2 = {
  initTokenClient: (config: {
    client_id: string
    scope: string
    callback: (response: GoogleTokenResponse) => void
    error_callback?: (error: unknown) => void
  }) => GoogleTokenClient
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GoogleOauth2
      }
    }
  }
}

let googleScriptPromise: Promise<void> | null = null

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google OAuth is only available in the browser'))
  }

  if (window.google?.accounts?.oauth2) {
    return Promise.resolve()
  }

  if (googleScriptPromise) {
    return googleScriptPromise
  }

  googleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google OAuth script'))
    document.head.appendChild(script)
  })

  return googleScriptPromise
}

export async function requestGoogleAccessToken(clientId: string): Promise<string> {
  const resolvedClientId = clientId.trim()
  if (!resolvedClientId) {
    throw new Error('Google client ID is missing. Set VITE_GOOGLE_CLIENT_ID.')
  }

  await loadGoogleIdentityScript()

  return new Promise((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2

    if (!oauth2) {
      reject(new Error('Google OAuth is not available in this browser context.'))
      return
    }

    const tokenClient = oauth2.initTokenClient({
      client_id: resolvedClientId,
      scope: 'openid email profile',
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error))
          return
        }

        const accessToken = response.access_token?.trim()
        if (!accessToken) {
          reject(new Error('Google did not return an access token.'))
          return
        }

        resolve(accessToken)
      },
      error_callback: () => {
        reject(new Error('Google login was cancelled or failed.'))
      },
    })

    tokenClient.requestAccessToken({ prompt: 'consent' })
  })
}
