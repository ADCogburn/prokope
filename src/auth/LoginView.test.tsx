import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { LoginView } from './LoginView'
import { AuthProvider } from './AuthContext'

// Google Identity Services is third-party infra: simulate its callback
// firing with a fake credential string rather than loading the real script,
// per #18's testing decisions.
describe('LoginView', () => {
  let capturedCallback: ((response: { credential: string }) => void) | undefined

  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
    capturedCallback = undefined
    window.google = {
      accounts: {
        id: {
          initialize: vi.fn((config) => {
            capturedCallback = config.callback
          }),
          renderButton: vi.fn(),
        },
      },
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete window.google
  })

  it('renders a container and asks Google to render the sign-in button into it', () => {
    render(
      <AuthProvider>
        <LoginView />
      </AuthProvider>,
    )

    expect(screen.getByTestId('google-signin-button')).toBeInTheDocument()
    expect(window.google!.accounts.id.renderButton).toHaveBeenCalledWith(
      screen.getByTestId('google-signin-button'),
      expect.anything(),
    )
  })

  it("firing Google's callback with a credential calls the auth module's login", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ token: 'issued-token', userId: 'u1', email: 'teacher@example.com', isDemo: false }),
        { status: 200 },
      ),
    )

    render(
      <AuthProvider>
        <LoginView />
      </AuthProvider>,
    )

    expect(capturedCallback).toBeDefined()
    capturedCallback!({ credential: 'fake-credential' })

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/google'),
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('renders an "Explore as Guest" button that calls POST /auth/demo', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ token: 'demo-token', userId: 'demo-1', email: 'demo@example.com', isDemo: true }),
        { status: 200 },
      ),
    )

    render(
      <AuthProvider>
        <LoginView />
      </AuthProvider>,
    )

    screen.getByRole('button', { name: 'Explore as Guest' }).click()

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/demo'),
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('shows a graceful error when demo sign-in fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }))

    render(
      <AuthProvider>
        <LoginView />
      </AuthProvider>,
    )

    screen.getByRole('button', { name: 'Explore as Guest' }).click()

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})
