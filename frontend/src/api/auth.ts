import { AxiosError } from 'axios'
import {
  authClient,
  clearAccessToken,
  getCsrfHeaders,
  refreshAccessToken,
  setAccessToken,
  waitForPendingRefresh,
} from './client'

export interface AuthUser {
  id: number
  username: string
}

interface LoginResponse {
  access: string
  user: AuthUser
}

export interface RegistrationData {
  username: string
  password: string
  password_confirm: string
}

export async function login(username: string, password: string) {
  const headers = await getCsrfHeaders()
  const { data } = await authClient.post<LoginResponse>(
    '/auth/login/',
    { username, password },
    { headers },
  )
  setAccessToken(data.access)
  return data.user
}

export async function register(payload: RegistrationData) {
  const headers = await getCsrfHeaders()
  const { data } = await authClient.post<AuthUser>('/auth/register/', payload, {
    headers,
  })
  return data
}

export async function restoreSession() {
  const token = await refreshAccessToken(false)
  const { data } = await authClient.get<AuthUser>('/auth/me/', {
    headers: { Authorization: `Bearer ${token}` },
  })
  return data
}

export async function logout() {
  await waitForPendingRefresh()
  const headers = await getCsrfHeaders()
  await authClient.post('/auth/logout/', undefined, { headers })
  clearAccessToken()
}

type ErrorData = Record<string, string | string[] | undefined>

export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
) {
  if (!(error instanceof AxiosError)) {
    return error instanceof Error ? error.message : fallback
  }
  if (!error.response) {
    return 'Unable to reach the server. Check your connection and try again.'
  }
  if (error.response.status === 429) {
    return 'Too many attempts. Please wait a moment and try again.'
  }

  const data = error.response.data as ErrorData | undefined
  const detail = data?.detail
  if (Array.isArray(detail)) return detail.join(' ')
  if (typeof detail === 'string') return detail
  return fallback
}

export function getRegistrationErrors(error: unknown) {
  if (!(error instanceof AxiosError) || !error.response) {
    return { form: getApiErrorMessage(error) }
  }

  const data = error.response.data as ErrorData
  const join = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value.join(' ') : value

  return {
    username: join(data.username),
    password: join(data.password),
    passwordConfirm: join(data.password_confirm),
    form: join(data.detail) ?? join(data.non_field_errors),
  }
}
