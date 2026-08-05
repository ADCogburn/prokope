import { createContext } from 'react'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthUser {
  userId: string
  email: string
  isDemo: boolean
}

export interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  login: (credential: string) => Promise<void>
  loginAsDemo: () => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
