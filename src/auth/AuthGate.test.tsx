import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthGate } from './AuthGate'
import { AuthProvider } from './AuthContext'
import { AUTH_TOKEN_STORAGE_KEY } from './token'

describe('AuthGate', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
    window.google = { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } } }
  })

  function renderGate() {
    return render(
      <AuthProvider>
        <AuthGate>
          <div>Placeholder app</div>
        </AuthGate>
      </AuthProvider>,
    )
  }

  it('shows the login view when unauthenticated', async () => {
    renderGate()

    await waitFor(() => expect(screen.getByTestId('google-signin-button')).toBeInTheDocument())
    expect(screen.queryByText('Placeholder app')).not.toBeInTheDocument()
  })

  it('shows a loading state while a stored token is being revalidated', () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}))

    renderGate()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('Placeholder app')).not.toBeInTheDocument()
  })

  it('shows the app when authenticated', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ userId: 'u1', email: 'teacher@example.com' }), { status: 200 }),
    )

    renderGate()

    await waitFor(() => expect(screen.getByText('Placeholder app')).toBeInTheDocument())
  })
})
