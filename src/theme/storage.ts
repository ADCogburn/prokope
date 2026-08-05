export type Theme = 'light' | 'dark' | 'system'

const THEME_KEY = 'prokope:theme'
const CHOICE_MADE_KEY = 'prokope:theme-choice-made'

// Fired by resetThemeForNewDemo() so a mounted ThemeProvider can pick up the
// reset immediately, without ThemeContext depending on AuthContext (or vice
// versa) -- see AuthContext.tsx's loginAsDemo().
export const THEME_RESET_EVENT = 'prokope:theme-reset'

export function getStoredTheme(): Theme {
  const value = localStorage.getItem(THEME_KEY)
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function setStoredTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme)
}

// True once the teacher has made an explicit Light/Dark/System selection,
// even if they picked System (already the default) -- any interaction with
// the control counts, per #50.
export function hasMadeThemeChoice(): boolean {
  return localStorage.getItem(CHOICE_MADE_KEY) === 'true'
}

export function markThemeChoiceMade(): void {
  localStorage.setItem(CHOICE_MADE_KEY, 'true')
}

/**
 * Resets the stored theme and "has chosen" flag so a brand new demo session
 * looks like a first-time visitor (#50) -- nothing else clears client-side
 * localStorage on a fresh demo login. Local-only per ADR-0001, so this is a
 * plain localStorage write, not a sync/API concern.
 */
export function resetThemeForNewDemo(): void {
  localStorage.removeItem(THEME_KEY)
  localStorage.removeItem(CHOICE_MADE_KEY)
  window.dispatchEvent(new Event(THEME_RESET_EVENT))
}
