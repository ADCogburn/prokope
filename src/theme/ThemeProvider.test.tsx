import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { ThemeProvider } from './ThemeProvider'
import { useTheme } from './useTheme'
import { getStoredTheme, hasMadeThemeChoice, resetThemeForNewDemo, setStoredTheme } from './storage'

function Probe() {
  const { theme, choiceMade, setTheme } = useTheme()
  return (
    <div>
      <div data-testid="theme">{theme}</div>
      <div data-testid="choice-made">{String(choiceMade)}</div>
      <button onClick={() => setTheme('dark')}>set-dark</button>
      <button onClick={() => setTheme('light')}>set-light</button>
      <button onClick={() => setTheme('system')}>set-system</button>
    </div>
  )
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )
}

describe('ThemeProvider / useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('defaults to system with no choice made and no data-theme attribute', () => {
    renderProbe()

    expect(screen.getByTestId('theme')).toHaveTextContent('system')
    expect(screen.getByTestId('choice-made')).toHaveTextContent('false')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('picks up an already-stored theme and choice flag on mount', () => {
    setStoredTheme('dark')
    localStorage.setItem('prokope:theme-choice-made', 'true')

    renderProbe()

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(screen.getByTestId('choice-made')).toHaveTextContent('true')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('setTheme() persists the choice, marks it made, and sets data-theme', () => {
    renderProbe()

    act(() => {
      screen.getByText('set-dark').click()
    })

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(screen.getByTestId('choice-made')).toHaveTextContent('true')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(getStoredTheme()).toBe('dark')
    expect(hasMadeThemeChoice()).toBe(true)
  })

  it('setTheme("system") after a prior choice still counts as a choice and clears data-theme', () => {
    renderProbe()

    act(() => {
      screen.getByText('set-dark').click()
    })
    act(() => {
      screen.getByText('set-system').click()
    })

    expect(screen.getByTestId('theme')).toHaveTextContent('system')
    expect(screen.getByTestId('choice-made')).toHaveTextContent('true')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('resets to system and clears choiceMade when resetThemeForNewDemo() fires its event', () => {
    renderProbe()

    act(() => {
      screen.getByText('set-light').click()
    })
    expect(screen.getByTestId('theme')).toHaveTextContent('light')

    act(() => {
      resetThemeForNewDemo()
    })

    expect(screen.getByTestId('theme')).toHaveTextContent('system')
    expect(screen.getByTestId('choice-made')).toHaveTextContent('false')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})
