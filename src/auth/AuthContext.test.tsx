import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { db } from '../db/schema'
import { putRawClass } from '../db/sync'
import { getPullWatermark, getPushWatermark, setPullWatermark, setPushWatermark } from '../sync/watermarks'
import { AuthProvider } from './AuthContext'
import { useAuth } from './useAuth'
import { AUTH_TOKEN_STORAGE_KEY } from './token'

function Probe() {
  const { status, user, login, loginAsDemo, logout } = useAuth()
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="email">{user?.email ?? ''}</div>
      <div data-testid="is-demo">{String(user?.isDemo ?? false)}</div>
      <button onClick={() => login('a-credential')}>login</button>
      <button onClick={() => void loginAsDemo().catch(() => {})}>login-demo</button>
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

  afterEach(async () => {
    vi.unstubAllGlobals()
    await Promise.all(db.tables.map((table) => table.clear()))
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
      new Response(
        JSON.stringify({ userId: 'u1', email: 'teacher@example.com', isDemo: false }),
        { status: 200 },
      ),
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
        JSON.stringify({ token: 'issued-token', userId: 'u2', email: 'new.teacher@example.com', isDemo: false }),
        { status: 200 },
      ),
    )

    renderProbe()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))

    await act(async () => {
      screen.getByText('login').click()
    })

    // Anchored regex, not the plain string: toHaveTextContent does a substring
    // match, and 'unauthenticated' contains 'authenticated' -- a plain-string
    // wait here would resolve on the pre-login status and race the assertions
    // below against login()'s still-pending state updates.
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent(/^authenticated$/))
    expect(screen.getByTestId('email')).toHaveTextContent('new.teacher@example.com')
    expect(screen.getByTestId('is-demo')).toHaveTextContent('false')
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('issued-token')
  })

  it('login() wipes a previous session\'s local rows and watermarks before adopting the new token (#65)', async () => {
    await putRawClass({
      id: 'stale-class',
      user_id: 'a-previous-sessions-user-id',
      name: 'Stale',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      deleted_at: null,
    })
    setPushWatermark('2024-01-01T00:00:00.000Z')
    setPullWatermark('2024-01-01T00:00:00.000Z')
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ token: 'issued-token', userId: 'u2', email: 'new.teacher@example.com', isDemo: false }),
        { status: 200 },
      ),
    )

    renderProbe()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent(/^unauthenticated$/))

    await act(async () => {
      screen.getByText('login').click()
    })
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent(/^authenticated$/))

    expect(await db.class.get('stale-class')).toBeUndefined()
    expect(getPushWatermark()).toBeNull()
    expect(getPullWatermark()).toBeNull()
  })

  it('loginAsDemo() transitions to authenticated with an isDemo user and stores the token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ token: 'demo-token', userId: 'u-demo', email: 'demo@example.com', isDemo: true }),
        { status: 200 },
      ),
    )

    renderProbe()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))

    await act(async () => {
      screen.getByText('login-demo').click()
    })

    // See the login() test above for why this must be an anchored regex.
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent(/^authenticated$/))
    expect(screen.getByTestId('is-demo')).toHaveTextContent('true')
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('demo-token')
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/demo'), expect.objectContaining({ method: 'POST' }))
  })

  it('loginAsDemo() throws and leaves the session unauthenticated when the server rejects it', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }))

    renderProbe()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))

    await act(async () => {
      screen.getByText('login-demo').click()
    })

    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('logout() discards the token and transitions to unauthenticated', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-valid-token')
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ userId: 'u3', email: 'logout.teacher@example.com', isDemo: false }),
        { status: 200 },
      ),
    )

    renderProbe()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    act(() => {
      screen.getByText('logout').click()
    })

    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('logout() wipes local rows and watermarks (#65)', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-valid-token')
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ userId: 'u3', email: 'logout.teacher@example.com', isDemo: false }),
        { status: 200 },
      ),
    )
    await putRawClass({
      id: 'own-class',
      user_id: 'u3',
      name: 'Room 5',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      deleted_at: null,
    })
    setPushWatermark('2024-01-01T00:00:00.000Z')

    renderProbe()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent(/^authenticated$/))

    act(() => {
      screen.getByText('logout').click()
    })

    // logout() fires the reset without awaiting it (see AuthContext.tsx),
    // so poll for it to land rather than asserting immediately.
    await vi.waitFor(async () => {
      expect(await db.class.get('own-class')).toBeUndefined()
    })
    expect(getPushWatermark()).toBeNull()
  })
})
