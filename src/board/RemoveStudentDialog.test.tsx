import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RemoveStudentDialog } from './RemoveStudentDialog'
import type { StudentRow } from '../db/schema'

function studentRow(overrides: Partial<StudentRow> = {}): StudentRow {
  return {
    id: 'stu1',
    class_id: 'class1',
    name: 'Emily',
    position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  }
}

describe('RemoveStudentDialog', () => {
  it('names the student and warns that removal hides their progress', () => {
    render(<RemoveStudentDialog student={studentRow({ name: 'Emily' })} onConfirm={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Remove student' })).toBeInTheDocument()
    expect(screen.getByText('Remove Emily?')).toBeInTheDocument()
    expect(screen.getByText(/hides all of their progress/)).toBeInTheDocument()
  })

  it('calls onConfirm when "Remove student" is clicked', () => {
    const onConfirm = vi.fn()
    render(<RemoveStudentDialog student={studentRow()} onConfirm={onConfirm} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove student' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<RemoveStudentDialog student={studentRow()} onConfirm={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<RemoveStudentDialog student={studentRow()} onConfirm={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('dialog').parentElement!)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when the dialog content itself is clicked', () => {
    const onClose = vi.fn()
    render(<RemoveStudentDialog student={studentRow()} onConfirm={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('dialog'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<RemoveStudentDialog student={studentRow()} onConfirm={vi.fn()} onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
