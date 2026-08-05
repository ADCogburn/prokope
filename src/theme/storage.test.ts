import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  THEME_RESET_EVENT,
  getStoredTheme,
  hasMadeThemeChoice,
  markThemeChoiceMade,
  resetThemeForNewDemo,
  setStoredTheme,
} from './storage'

describe('theme storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to system when nothing is stored', () => {
    expect(getStoredTheme()).toBe('system')
  })

  it('defaults to system when the stored value is not a recognized theme', () => {
    localStorage.setItem('prokope:theme', 'not-a-theme')
    expect(getStoredTheme()).toBe('system')
  })

  it('round-trips light and dark through localStorage', () => {
    setStoredTheme('dark')
    expect(getStoredTheme()).toBe('dark')

    setStoredTheme('light')
    expect(getStoredTheme()).toBe('light')
  })

  it('has not made a choice until markThemeChoiceMade() is called', () => {
    expect(hasMadeThemeChoice()).toBe(false)
    markThemeChoiceMade()
    expect(hasMadeThemeChoice()).toBe(true)
  })

  it('resetThemeForNewDemo() clears the stored theme and choice flag', () => {
    setStoredTheme('dark')
    markThemeChoiceMade()

    resetThemeForNewDemo()

    expect(getStoredTheme()).toBe('system')
    expect(hasMadeThemeChoice()).toBe(false)
  })

  it('resetThemeForNewDemo() dispatches a window event so a mounted ThemeProvider can react', () => {
    const listener = vi.fn()
    window.addEventListener(THEME_RESET_EVENT, listener)

    resetThemeForNewDemo()

    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(THEME_RESET_EVENT, listener)
  })
})
