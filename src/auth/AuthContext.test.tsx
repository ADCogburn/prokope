import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { AUTH_TOKEN_STORAGE_KEY } from './token'

function Probe() {
  const { status, user, login, logout } = useAuth()
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="email">{user?.email ?? ''}</div>
      <button onClick={() => login('a-credential')}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  )
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
}

describe('AuthProvider / useAuth', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves to unauthenticated when no token is stored', async () => {
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('starts in the loading state while a stored token is being revalidated', () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-valid-token')
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}))

    renderProbe()

    expect(screen.getByTestId('status')).toHaveTextContent('loading')
  })

  it('revalidates a stored token and resolves to authenticated on success', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-valid-token')
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ userId: 'u1', email: 'teacher@example.com' }), { status: 200 }),
    )

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(screen.getByTestId('email')).toHaveTextContent('teacher@example.com')
    const [, init] = vi.mocked(fetch).mock.calls[0]!
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer a-valid-token')
  })

  it('falls back to unauthenticated and clears the token when the stored token is invalid', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-stale-token')
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }))

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('login() transitions from unauthenticated to authenticated and stores the token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ token: 'issued-token', userId: 'u2', email: 'new.teacher@example.com' }),
        { status: 200 },
      ),
    )

    renderProbe()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))

    await act(async () => {
      screen.getByText('login').click()
    })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(screen.getByTestId('email')).toHaveTextContent('new.teacher@example.com')
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('issued-token')
  })

  it('logout() discards the token and transitions to unauthenticated', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-valid-token')
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ userId: 'u3', email: 'logout.teacher@example.com' }), { status: 200 }),
    )

    renderProbe()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    act(() => {
      screen.getByText('logout').click()
    })

    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull()
  })
})
