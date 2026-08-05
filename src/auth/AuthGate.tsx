import type { ReactNode } from 'react'
import { useAuth } from './useAuth'
import { LoginView } from './LoginView'

// A conditional render, not a router: #22's class-scoped routing lives
// inside App, composed underneath this gate rather than replacing it --
// App's routes assume an authenticated user, a precondition this provides.
// Satisfies #18 user stories 9/10 (redirect between login and app on
// auth-status change) and 12 (a loading state so neither view flashes
// before the status check resolves).
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
