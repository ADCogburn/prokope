import { createContext } from 'react'
import type { Theme } from './storage'

export interface ThemeContextValue {
  theme: Theme
  /** Has the teacher made an explicit selection yet? Drives AccountBar's hover-reveal (#50). */
  choiceMade: boolean
  setTheme: (theme: Theme) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
