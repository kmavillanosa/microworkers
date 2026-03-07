import { useMemo, useState } from 'react'
import { Alert, Button, Card } from 'flowbite-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { StudioAuthSession } from '../api/types'
import { studioApi } from '../api/studioApi'
import { requestGoogleAccessToken } from '../auth/googleOAuth'
import { saveStudioAuthSession } from '../auth/session'

type AuthMode = 'login' | 'register'

type AuthPageProps = {
  mode: AuthMode
  onAuthenticated: (session: StudioAuthSession) => void
}

function resolveNextPath(search: string): string {
  const params = new URLSearchParams(search)
  const next = params.get('next')?.trim() ?? ''
  if (!next.startsWith('/')) {
    return '/settings'
  }

  if (next.startsWith('//')) {
    return '/settings'
  }

  return next
}

function resolveErrorMessage(error: unknown, mode: AuthMode): string {
  const fallback = mode === 'register' ? 'Google registration failed.' : 'Google login failed.'

  if (!(error instanceof Error)) {
    return fallback
  }

  const rawMessage = error.message?.trim()
  if (!rawMessage) {
    return fallback
  }

  try {
    const parsed = JSON.parse(rawMessage) as { message?: string | string[] }
    if (Array.isArray(parsed.message)) {
      const firstMessage = parsed.message.find((entry) => typeof entry === 'string' && entry.trim())
      if (firstMessage) {
        return firstMessage
      }
    }

    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message
    }
  } catch {
    return rawMessage
  }

  return rawMessage
}

export function AuthPage({ mode, onAuthenticated }: AuthPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nextPath = useMemo(() => resolveNextPath(location.search), [location.search])
  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim()

  const title = mode === 'register' ? 'Create an account' : 'Sign in'
  const subtitle =
    mode === 'register'
      ? 'Use your Google account to register for web-studio.'
      : 'Use your Google account to continue to web-studio.'
  const actionLabel = mode === 'register' ? 'Register with Google' : 'Login with Google'
  const alternatePath = mode === 'register' ? '/login' : '/register'
  const alternateText = mode === 'register' ? 'Already have an account?' : "Don’t have an account yet?"
  const alternateActionLabel = mode === 'register' ? 'Sign in' : 'Register'
  const alternateHref = `${alternatePath}?next=${encodeURIComponent(nextPath)}`

  const handleGoogleAuth = async () => {
    if (!googleClientId) {
      setError('Google login is not configured. Set VITE_GOOGLE_CLIENT_ID for web-studio.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      const googleAccessToken = await requestGoogleAccessToken(googleClientId)
      const session =
        mode === 'register'
          ? await studioApi.registerWithGoogle(googleAccessToken)
          : await studioApi.loginWithGoogle(googleAccessToken)

      saveStudioAuthSession(session)
      onAuthenticated(session)
      navigate(nextPath, { replace: true })
    } catch (authError) {
      setError(resolveErrorMessage(authError, mode))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950 lg:p-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <Card>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">{subtitle}</p>

          {error ? <Alert color="failure">{error}</Alert> : null}

          <Button color="blue" disabled={busy} onClick={() => void handleGoogleAuth()}>
            {busy ? 'Please wait…' : actionLabel}
          </Button>

          <p className="text-sm text-gray-600 dark:text-gray-300">
            {alternateText}{' '}
            <Link className="font-medium text-blue-600 hover:underline dark:text-blue-400" to={alternateHref}>
              {alternateActionLabel}
            </Link>
          </p>
        </Card>
      </div>
    </div>
  )
}
