import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ContextMenu } from './ContextMenu'

describe('ContextMenu', () => {
  it('renders every item passed in as props', () => {
    render(
      <ContextMenu
        items={[
          { label: 'Jump to lesson...', onSelect: vi.fn() },
          { label: 'Un-advance', onSelect: vi.fn() },
        ]}
        x={10}
        y={20}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('menuitem', { name: 'Jump to lesson...' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Un-advance' })).toBeInTheDocument()
  })

  it('renders into document.body via a portal, not its trigger render container', () => {
    const { container } = render(
      <ContextMenu items={[{ label: 'Jump to lesson...', onSelect: vi.fn() }]} x={10} y={20} onClose={vi.fn()} />,
    )

    const menu = screen.getByRole('menu')
    expect(container.contains(menu)).toBe(false)
    expect(menu.parentElement).toBe(document.body)
  })

  it('clicking an item calls its onSelect and closes the menu', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<ContextMenu items={[{ label: 'Jump to lesson...', onSelect }]} x={10} y={20} onClose={onClose} />)

    fireEvent.click(screen.getByRole('menuitem', { name: 'Jump to lesson...' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a disabled item does not fire onSelect (or close the menu)', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <ContextMenu
        items={[{ label: 'Jump to lesson...', onSelect, disabled: true }]}
        x={0}
        y={0}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('menuitem', { name: 'Jump to lesson...' }))

    expect(onSelect).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clicking outside the menu calls onClose without invoking any item', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <div>
        <button type="button">Elsewhere</button>
        <ContextMenu items={[{ label: 'Jump to lesson...', onSelect }]} x={0} y={0} onClose={onClose} />
      </div>,
    )

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Elsewhere' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('pressing Escape calls onClose without invoking any item', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<ContextMenu items={[{ label: 'Jump to lesson...', onSelect }]} x={0} y={0} onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
