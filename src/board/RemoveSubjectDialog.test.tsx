import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RemoveSubjectDialog } from './RemoveSubjectDialog'
import type { SubjectRow } from '../db/schema'

function subjectRow(overrides: Partial<SubjectRow> = {}): SubjectRow {
  return {
    id: 'subject1',
    class_id: 'class1',
    name: 'Math',
    position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  }
}

describe('RemoveSubjectDialog', () => {
  it('names the subject and warns that removal hides its lessons and every student\'s progress', () => {
    render(<RemoveSubjectDialog subject={subjectRow({ name: 'Math' })} onConfirm={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Remove subject' })).toBeInTheDocument()
    expect(screen.getByText('Remove Math?')).toBeInTheDocument()
    expect(screen.getByText(/hides its lessons and every student's progress in it/)).toBeInTheDocument()
  })

  it('calls onConfirm when "Remove subject" is clicked', () => {
    const onConfirm = vi.fn()
    render(<RemoveSubjectDialog subject={subjectRow()} onConfirm={onConfirm} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove subject' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<RemoveSubjectDialog subject={subjectRow()} onConfirm={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<RemoveSubjectDialog subject={subjectRow()} onConfirm={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('dialog').parentElement!)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when the dialog content itself is clicked', () => {
    const onClose = vi.fn()
    render(<RemoveSubjectDialog subject={subjectRow()} onConfirm={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('dialog'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<RemoveSubjectDialog subject={subjectRow()} onConfirm={vi.fn()} onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
