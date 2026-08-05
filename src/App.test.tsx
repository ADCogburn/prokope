import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { AuthGate } from './auth/AuthGate'
import { AUTH_TOKEN_STORAGE_KEY } from './auth/token'
import { db } from './db/schema'

// Mirrors main.tsx's real composition (AuthProvider > AuthGate > App) so
// this exercises the actual tree teachers hit, not App in isolation --
// App's routes assume an authenticated user, a precondition AuthGate
// provides in production.
describe('App', () => {
  beforeEach(async () => {
    localStorage.clear()
    await Promise.all(db.tables.map((table) => table.clear()))
  })

  it('shows the login view when unauthenticated', async () => {
    vi.stubGlobal('fetch', vi.fn())

    render(
      <AuthProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('google-signin-button')).toBeInTheDocument())
  })

  it('routes a signed-in teacher with no class yet to the class setup screen', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ userId: 'u1', email: 'teacher@example.com' }), { status: 200 }),
      ),
    )

    render(
      <AuthProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('Set up your class')).toBeInTheDocument())
    expect(screen.getByText('teacher@example.com')).toBeInTheDocument()
  })
})
