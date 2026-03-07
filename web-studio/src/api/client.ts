import { getStoredStudioAccessToken } from '../auth/session'

const DEFAULT_API_BASE_URL = 'https://reelagad.com'

function normalizeApiBaseUrl(value: string | undefined, fallback: string): string {
  const resolved = (value ?? '').trim() || fallback
  return resolved.replace(/\/+$/, '')
}

export const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL, DEFAULT_API_BASE_URL)

class HttpError extends Error {
  readonly status: number
  readonly path: string

  constructor(path: string, status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.path = path
  }
}

type JsonRecord = Record<string, unknown>

function resolveHeaders(init: RequestInit): HeadersInit | undefined {
  const headers = new Headers(init.headers)
  const accessToken = getStoredStudioAccessToken()

  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const hasBody = init.body !== undefined && init.body !== null
  const isFormData = init.body instanceof FormData

  if (!hasBody || isFormData) {
    return headers
  }

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return headers
}

async function request<TResponse>(path: string, init: RequestInit = {}): Promise<TResponse> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: resolveHeaders(init),
  })

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    throw new HttpError(path, response.status, bodyText || response.statusText)
  }

  if (response.status === 204) {
    return undefined as TResponse
  }

  const responseText = await response.text().catch(() => '')
  if (!responseText) {
    return undefined as TResponse
  }

  return JSON.parse(responseText) as TResponse
}

export const apiClient = {
  get<TResponse>(path: string) {
    return request<TResponse>(path)
  },
  post<TResponse>(path: string, body?: JsonRecord | FormData) {
    return request<TResponse>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    })
  },
  patch<TResponse>(path: string, body?: JsonRecord) {
    return request<TResponse>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    })
  },
  put<TResponse>(path: string, body?: JsonRecord) {
    return request<TResponse>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    })
  },
  remove(path: string) {
    return request<void>(path, { method: 'DELETE' })
  },
}