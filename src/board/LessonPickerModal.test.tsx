import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LessonPickerModal } from './LessonPickerModal'
import type { LessonRow } from '../db/schema'

function lessonRow(overrides: Partial<LessonRow> = {}): LessonRow {
  return {
    id: 'lesson1',
    subject_id: 'subj1',
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

describe('LessonPickerModal', () => {
  it('renders one row per lesson labeled via formatLessonLabel', () => {
    render(
      <LessonPickerModal
        studentName="Emily"
        lessons={[
          lessonRow({ id: 'l1', unit: 1, lesson_in_unit: 1, title: 'Fractions' }),
          lessonRow({ id: 'l2', unit: 1, lesson_in_unit: 2, title: 'Decimals' }),
        ]}
        currentPosition={{ unit: 0, lesson_in_unit: 0 }}
        onSelectLesson={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '1.1 - Fractions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1.2 - Decimals' })).toBeInTheDocument()
  })

  it("calls onSelectLesson with the clicked row's lesson", () => {
    const onSelectLesson = vi.fn()
    const decimals = lessonRow({ id: 'l2', unit: 1, lesson_in_unit: 2, title: 'Decimals' })
    render(
      <LessonPickerModal
        studentName="Emily"
        lessons={[lessonRow({ id: 'l1', unit: 1, lesson_in_unit: 1, title: 'Fractions' }), decimals]}
        currentPosition={{ unit: 0, lesson_in_unit: 0 }}
        onSelectLesson={onSelectLesson}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '1.2 - Decimals' }))

    expect(onSelectLesson).toHaveBeenCalledWith(decimals)
    expect(onSelectLesson).toHaveBeenCalledTimes(1)
  })

  it('visually distinguishes the row matching currentPosition', () => {
    render(
      <LessonPickerModal
        studentName="Emily"
        lessons={[
          lessonRow({ id: 'l1', unit: 1, lesson_in_unit: 1, title: 'Fractions' }),
          lessonRow({ id: 'l2', unit: 1, lesson_in_unit: 2, title: 'Decimals' }),
        ]}
        currentPosition={{ unit: 1, lesson_in_unit: 2 }}
        onSelectLesson={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '1.1 - Fractions' })).toHaveClass(
      'lesson-picker-modal__item',
    )
    expect(screen.getByRole('button', { name: '1.1 - Fractions' })).not.toHaveClass(
      'lesson-picker-modal__item--current',
    )
    expect(screen.getByRole('button', { name: /1\.2 - Decimals/ })).toHaveClass(
      'lesson-picker-modal__item--current',
    )
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <LessonPickerModal
        studentName="Emily"
        lessons={[lessonRow()]}
        currentPosition={{ unit: 0, lesson_in_unit: 0 }}
        onSelectLesson={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(
      <LessonPickerModal
        studentName="Emily"
        lessons={[lessonRow()]}
        currentPosition={{ unit: 0, lesson_in_unit: 0 }}
        onSelectLesson={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('dialog').parentElement!)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when the dialog content itself is clicked', () => {
    const onClose = vi.fn()
    render(
      <LessonPickerModal
        studentName="Emily"
        lessons={[lessonRow()]}
        currentPosition={{ unit: 0, lesson_in_unit: 0 }}
        onSelectLesson={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('dialog'))

    expect(onClose).not.toHaveBeenCalled()
  })
})
