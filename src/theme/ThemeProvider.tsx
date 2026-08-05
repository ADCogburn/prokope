import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  THEME_RESET_EVENT,
  getStoredTheme,
  hasMadeThemeChoice,
  markThemeChoiceMade,
  setStoredTheme,
  type Theme,
} from './storage'
import { ThemeContext } from './themeContextInstance'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme())
  const [choiceMade, setChoiceMade] = useState<boolean>(() => hasMadeThemeChoice())

  // `system` leaves index.css's prefers-color-scheme media query in charge;
  // an explicit choice sets data-theme so the higher-specificity override
  // blocks in index.css win regardless of OS preference.
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', theme)
    }
    return () => root.removeAttribute('data-theme')
  }, [theme])

  // Picked up from resetThemeForNewDemo() (storage.ts), called by
  // AuthContext's loginAsDemo() -- a plain DOM event rather than a context
  // dependency so auth and theme stay decoupled (#50).
  useEffect(() => {
    function handleReset() {
      setThemeState('system')
      setChoiceMade(false)
    }
    window.addEventListener(THEME_RESET_EVENT, handleReset)
    return () => window.removeEventListener(THEME_RESET_EVENT, handleReset)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setStoredTheme(next)
    markThemeChoiceMade()
    setThemeState(next)
    setChoiceMade(true)
  }, [])

  const value = useMemo(() => ({ theme, choiceMade, setTheme }), [theme, choiceMade, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
