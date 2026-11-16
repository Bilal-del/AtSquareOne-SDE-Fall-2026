import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  restoreSession,
  type AuthUser,
  type RegistrationData,
} from '../api/auth'
import { clearAccessToken, setSessionInvalidHandler } from '../api/client'
import { AuthContext, type AuthStatus } from './AuthState'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('initializing')
  const initializationPromise = useRef<Promise<AuthUser> | null>(null)

  const clearSession = useCallback(() => {
    clearAccessToken()
    setUser(null)
    setStatus('anonymous')
  }, [])

  useEffect(() => {
    setSessionInvalidHandler(clearSession)
    return () => setSessionInvalidHandler(null)
  }, [clearSession])

  useEffect(() => {
    if (!initializationPromise.current) {
      initializationPromise.current = restoreSession()
    }

    let active = true
    initializationPromise.current
      .then((restoredUser) => {
        if (!active) return
        setUser(restoredUser)
        setStatus('authenticated')
      })
      .catch(() => {
        if (active) clearSession()
      })

    return () => {
      active = false
    }
  }, [clearSession])

  const login = useCallback(async (username: string, password: string) => {
    const authenticatedUser = await loginRequest(username, password)
    setUser(authenticatedUser)
    setStatus('authenticated')
    return authenticatedUser
  }, [])

  const register = useCallback(
    (payload: RegistrationData) => registerRequest(payload),
    [],
  )

  const logout = useCallback(async () => {
    await logoutRequest()
    clearSession()
  }, [clearSession])

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      login,
      register,
      logout,
    }),
    [user, status, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
