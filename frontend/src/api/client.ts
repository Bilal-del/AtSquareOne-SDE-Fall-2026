import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

const browserIsLocal =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1')

function resolveApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL
  const fallbackOrigin = browserIsLocal
    ? `http://${window.location.hostname}:8000`
    : 'http://localhost:8000'
  const resolutionBase =
    typeof window !== 'undefined' ? window.location.origin : fallbackOrigin
  const url = new URL(configuredUrl ?? fallbackOrigin, resolutionBase)

  const configuredIsLocal =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (browserIsLocal && configuredIsLocal) {
    url.hostname = window.location.hostname
  }

  const path = url.pathname.replace(/\/$/, '')
  url.pathname = path.endsWith('/api') ? path : `${path}/api`
  return url.toString().replace(/\/$/, '')
}

export const API_BASE_URL = resolveApiBaseUrl()

export const authClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

let accessToken: string | null = null
let refreshPromise: Promise<string> | null = null
let csrfPromise: Promise<void> | null = null
let sessionInvalidHandler: (() => void) | null = null

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function clearAccessToken() {
  accessToken = null
}

export function setSessionInvalidHandler(handler: (() => void) | null) {
  sessionInvalidHandler = handler
}

function readCookie(name: string) {
  const prefix = `${name}=`
  const cookie = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(prefix))

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null
}

export function getCsrfToken() {
  return readCookie('csrftoken')
}

export async function ensureCsrfCookie() {
  if (getCsrfToken()) return

  if (!csrfPromise) {
    csrfPromise = authClient
      .get('/auth/csrf/')
      .then(() => undefined)
      .finally(() => {
        csrfPromise = null
      })
  }

  await csrfPromise
  if (!getCsrfToken()) {
    throw new Error('The CSRF cookie could not be initialized.')
  }
}

export async function getCsrfHeaders() {
  await ensureCsrfCookie()
  return { 'X-CSRFToken': getCsrfToken() as string }
}

export function refreshAccessToken(notifyInvalidSession = true) {
  if (!refreshPromise) {
    refreshPromise = getCsrfHeaders()
      .then((headers) =>
        authClient.post<{ access: string }>('/auth/refresh/', undefined, {
          headers,
        }),
      )
      .then(({ data }) => {
        setAccessToken(data.access)
        return data.access
      })
      .catch((error) => {
        clearAccessToken()
        if (notifyInvalidSession) sessionInvalidHandler?.()
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

export async function waitForPendingRefresh() {
  if (refreshPromise) await refreshPromise.catch(() => undefined)
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetriableRequestConfig | undefined

    if (error.response?.status !== 401 || !request || request._retry) {
      return Promise.reject(error)
    }

    request._retry = true
    try {
      const token = await refreshAccessToken()
      request.headers.Authorization = `Bearer ${token}`
      return apiClient(request)
    } catch {
      return Promise.reject(error)
    }
  },
)

export default apiClient
