import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RemoveLessonDialog } from './RemoveLessonDialog'
import type { LessonRow } from '../db/schema'

function lessonRow(overrides: Partial<LessonRow> = {}): LessonRow {
  return {
    id: 'lesson1',
    subject_id: 'subject1',
    unit: 1,
    lesson_in_unit: 1,
    title: 'Fractions',
    description: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  }
}

describe('RemoveLessonDialog', () => {
  it('names the lesson and warns that removal hides it from the curriculum', () => {
    render(<RemoveLessonDialog lesson={lessonRow({ title: 'Fractions' })} onConfirm={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Remove lesson' })).toBeInTheDocument()
    expect(screen.getByText('Remove Fractions?')).toBeInTheDocument()
    expect(screen.getByText(/hides it from the curriculum/)).toBeInTheDocument()
  })

  it('calls onConfirm when "Remove lesson" is clicked', () => {
    const onConfirm = vi.fn()
    render(<RemoveLessonDialog lesson={lessonRow()} onConfirm={onConfirm} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove lesson' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<RemoveLessonDialog lesson={lessonRow()} onConfirm={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<RemoveLessonDialog lesson={lessonRow()} onConfirm={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('dialog').parentElement!)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when the dialog content itself is clicked', () => {
    const onClose = vi.fn()
    render(<RemoveLessonDialog lesson={lessonRow()} onConfirm={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('dialog'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<RemoveLessonDialog lesson={lessonRow()} onConfirm={vi.fn()} onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
