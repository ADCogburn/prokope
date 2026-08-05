import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AccountBar } from './AccountBar'
import { AuthProvider } from './AuthContext'
import { AUTH_TOKEN_STORAGE_KEY } from './token'

describe('AccountBar', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders nothing while unauthenticated', () => {
    vi.stubGlobal('fetch', vi.fn())
    render(
      <AuthProvider>
        <AccountBar />
      </AuthProvider>,
    )

    expect(screen.queryByText('Log out')).not.toBeInTheDocument()
  })

  it("shows the signed-in teacher's email and a log out button", async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ userId: 'u1', email: 'teacher@example.com' }), { status: 200 }),
      ),
    )

    render(
      <AuthProvider>
        <AccountBar />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('teacher@example.com')).toBeInTheDocument())
  })

  it('logs out when the button is clicked', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ userId: 'u1', email: 'teacher@example.com' }), { status: 200 }),
      ),
    )

    render(
      <AuthProvider>
        <AccountBar />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))

    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull()
  })
})
