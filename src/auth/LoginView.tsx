import { useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import './LoginView.css'

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
  const { login, loginAsDemo } = useAuth()
  const buttonRef = useRef<HTMLDivElement>(null)
  const [demoError, setDemoError] = useState<string | null>(null)
  const [demoPending, setDemoPending] = useState(false)

  async function handleExploreAsGuest() {
    setDemoError(null)
    setDemoPending(true)
    try {
      await loginAsDemo()
    } catch {
      setDemoError('Demo mode is not available right now. Please try again later.')
    } finally {
      setDemoPending(false)
    }
  }

  // index.html loads the GIS script with async/defer, so it may not have
  // finished loading by the time this effect first runs -- poll briefly
  // rather than silently no-opping and leaving the teacher with no button.
  useEffect(() => {
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | undefined

    function renderGoogleButton() {
      if (!window.google || !buttonRef.current) {
        return false
      }

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          void login(response.credential)
        },
      })
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
      })
      return true
    }

    if (!renderGoogleButton()) {
      intervalId = setInterval(() => {
        if (cancelled || renderGoogleButton()) {
          clearInterval(intervalId)
        }
      }, 100)
    }

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [login])

  return (
    <div className="login-view">
      <h1 className="login-view__title">Prokope</h1>
      <p className="login-view__tagline">Know where every student stands</p>
      <div className="login-view__actions">
        <div ref={buttonRef} data-testid="google-signin-button" />
        <button
          type="button"
          className="login-view__guest-button"
          onClick={() => void handleExploreAsGuest()}
          disabled={demoPending}
        >
          Explore as Guest
        </button>
        {demoError && (
          <p role="alert" className="login-view__error">
            {demoError}
          </p>
        )}
      </div>
    </div>
  )
}
