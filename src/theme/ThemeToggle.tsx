import { useTheme } from './useTheme'
import type { Theme } from './storage'
import './ThemeToggle.css'

const OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

/**
 * Fully visible until the teacher's first explicit choice; after that it's
 * hidden by default and revealed on hover/focus of the enclosing
 * AccountBar (see .account-bar:hover/:focus-within in ThemeToggle.css) so it
 * doesn't permanently compete for space with the rest of the bar -- #50.
 */
export function ThemeToggle() {
  const { theme, choiceMade, setTheme } = useTheme()

  return (
    <div
      className={`theme-toggle${choiceMade ? ' theme-toggle--reveal-on-hover' : ''}`}
      role="radiogroup"
      aria-label="Theme"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={theme === option.value}
          className={`theme-toggle__option${theme === option.value ? ' theme-toggle__option--active' : ''}`}
          onClick={() => setTheme(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
