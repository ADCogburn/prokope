import { useEffect, useRef } from 'react'
import { useAuth } from './AuthContext'

// The Google client ID is a public, non-secret, build-time value set in
// Cloudflare Pages' env config, per #10's per-provider secrets convention.
const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''

interface GoogleCredentialResponse {
  credential: string
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: GoogleCredentialResponse) => void
          }) => void
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

export function LoginView() {
  const { login } = useAuth()
  const buttonRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!window.google || !buttonRef.current) {
      return
    }

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        void login(response.credential)
      },
    })
    window.google.accounts.id.renderButton(buttonRef.current, { theme: 'outline', size: 'large' })
  }, [login])

  return (
    <div>
      <h1>Sign in</h1>
      <p>Sign in with your Google account to continue.</p>
      <div ref={buttonRef} data-testid="google-signin-button" />
    </div>
  )
}
