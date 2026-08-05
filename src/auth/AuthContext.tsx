import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { API_URL } from '../config'
import { AUTH_TOKEN_STORAGE_KEY } from './token'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthUser {
  userId: string
  email: string
}

interface MeResponse {
  userId: string
  email: string
}

interface GoogleSignInResponse {
  token: string
  userId: string
  email: string
}

interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  login: (credential: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)

  // Revalidates a stored token against the API on load (rather than
  // trusting it as-is) so a stale or tampered token can't leave the teacher
  // in a false-authenticated state -- see #18 user stories 8 and 12.
  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    if (!token) {
      setStatus('unauthenticated')
      return
    }

    let cancelled = false

    fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (cancelled) return

        if (!response.ok) {
          localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
          setStatus('unauthenticated')
          return
        }

        const body = (await response.json()) as MeResponse
        setUser({ userId: body.userId, email: body.email })
        setStatus('authenticated')
      })
      .catch(() => {
        if (cancelled) return
        localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
        setStatus('unauthenticated')
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function login(credential: string) {
    const response = await fetch(`${API_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    })

    if (!response.ok) {
      throw new Error('Google sign-in was rejected')
    }

    const body = (await response.json()) as GoogleSignInResponse
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, body.token)
    setUser({ userId: body.userId, email: body.email })
    setStatus('authenticated')
  }

  function logout() {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    setUser(null)
    setStatus('unauthenticated')
  }

  return <AuthContext.Provider value={{ status, user, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
