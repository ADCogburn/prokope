import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ThemeToggle } from './ThemeToggle'
import { ThemeProvider } from './ThemeProvider'

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  )
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('renders Light, Dark, and System options with System checked by default', () => {
    renderToggle()

    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true')
  })

  it('is fully visible (no reveal-on-hover class) before any selection is made', () => {
    renderToggle()

    expect(screen.getByRole('radiogroup', { name: 'Theme' })).not.toHaveClass('theme-toggle--reveal-on-hover')
  })

  it('selecting an option marks it checked and applies the reveal-on-hover treatment', () => {
    renderToggle()

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))

    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toHaveClass('theme-toggle--reveal-on-hover')
  })

  it('re-selecting System after a prior choice still applies the reveal-on-hover treatment', () => {
    renderToggle()

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    fireEvent.click(screen.getByRole('radio', { name: 'System' }))

    expect(screen.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toHaveClass('theme-toggle--reveal-on-hover')
  })
})
