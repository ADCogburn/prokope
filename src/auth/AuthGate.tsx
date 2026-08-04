import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { LoginView } from './LoginView'

// A conditional render, not a router: real class-scoped routing is #22's
// job and would replace this placeholder entirely. Satisfies #18 user
// stories 9/10 (redirect between login and app on auth-status change) and
// 12 (a loading state so neither view flashes before the status check
// resolves).
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth()

  if (status === 'loading') {
    return <div role="status">Loading…</div>
  }

  if (status === 'unauthenticated') {
    return <LoginView />
  }

  return <>{children}</>
}
