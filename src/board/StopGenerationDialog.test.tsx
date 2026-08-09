import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { StopGenerationDialog } from './StopGenerationDialog'

describe('StopGenerationDialog', () => {
  it('warns that stopping will cancel the in-progress generation', () => {
    render(<StopGenerationDialog onConfirm={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Stop generation' })).toBeInTheDocument()
    expect(screen.getByText('Stop generation?')).toBeInTheDocument()
    expect(screen.getByText(/Generation is still in progress/)).toBeInTheDocument()
  })

  it('calls onConfirm when "Stop generation" is clicked', () => {
    const onConfirm = vi.fn()
    render(<StopGenerationDialog onConfirm={onConfirm} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Stop generation' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<StopGenerationDialog onConfirm={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<StopGenerationDialog onConfirm={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('dialog').parentElement!)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when the dialog content itself is clicked', () => {
    const onClose = vi.fn()
    render(<StopGenerationDialog onConfirm={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('dialog'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<StopGenerationDialog onConfirm={vi.fn()} onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
