import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { API_URL } from '../config'
import { AUTH_TOKEN_STORAGE_KEY } from './token'
import { AuthContext, type AuthStatus, type AuthUser } from './authContextInstance'

interface MeResponse {
  userId: string
  email: string
  isDemo: boolean
}

interface AuthResponse {
  token: string
  userId: string
  email: string
  isDemo: boolean
}

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
        setUser({ userId: body.userId, email: body.email, isDemo: body.isDemo })
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

  // Stabilized with useCallback: LoginView's Google-button effect depends on
  // `login`, and an unstable reference there causes GIS's initialize()/
  // renderButton() to fire again on every unrelated AuthProvider re-render,
  // rendering a second button into the same node (visible as a stray box
  // with default GIS styling behind the real one).
  const login = useCallback(async (credential: string) => {
    const response = await fetch(`${API_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    })

    if (!response.ok) {
      throw new Error('Google sign-in was rejected')
    }

    const body = (await response.json()) as AuthResponse
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, body.token)
    setUser({ userId: body.userId, email: body.email, isDemo: body.isDemo })
    setStatus('authenticated')
  }, [])

  // Same session/storage path as login(), just against /auth/demo, which
  // needs no credential -- see #32.
  const loginAsDemo = useCallback(async () => {
    const response = await fetch(`${API_URL}/auth/demo`, { method: 'POST' })

    if (!response.ok) {
      throw new Error('Demo sign-in is not available right now')
    }

    const body = (await response.json()) as AuthResponse
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, body.token)
    setUser({ userId: body.userId, email: body.email, isDemo: body.isDemo })
    setStatus('authenticated')
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  const value = useMemo(
    () => ({ status, user, login, loginAsDemo, logout }),
    [status, user, login, loginAsDemo, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
