import { useAuth } from './AuthContext'
import './AccountBar.css'

/** Persistent corner affordance so a signed-in teacher can always see who they are and sign out. */
export function AccountBar() {
  const { user, logout } = useAuth()

  if (!user) {
    return null
  }

  return (
    <div className="account-bar">
      <span className="account-bar__email">{user.email}</span>
      <button type="button" onClick={logout}>
        Log out
      </button>
    </div>
  )
}
