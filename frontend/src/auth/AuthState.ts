import { createContext, useContext } from 'react'
import type { AuthUser, RegistrationData } from '../api/auth'

export type AuthStatus = 'initializing' | 'authenticated' | 'anonymous'

export interface AuthContextValue {
  user: AuthUser | null
  status: AuthStatus
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<AuthUser>
  register: (payload: RegistrationData) => Promise<AuthUser>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider.')
  return context
}
