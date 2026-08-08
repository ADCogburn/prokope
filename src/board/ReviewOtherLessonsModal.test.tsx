import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ReviewOtherLessonsModal } from './ReviewOtherLessonsModal'
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

describe('ReviewOtherLessonsModal', () => {
  it('renders one checkbox row per lesson, labeled via formatLessonLabel, in curriculum order', () => {
    render(
      <ReviewOtherLessonsModal
        studentName="Emily"
        lessons={[
          lessonRow({ id: 'l1', unit: 1, lesson_in_unit: 1, title: 'Fractions' }),
          lessonRow({ id: 'l2', unit: 1, lesson_in_unit: 2, title: 'Decimals' }),
        ]}
        flaggedLessonIds={new Set()}
        onToggleLesson={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('checkbox', { name: '1.1 - Fractions' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '1.2 - Decimals' })).toBeInTheDocument()
  })

  it('reflects each lesson\'s current ReviewFlag state via the checkbox', () => {
    render(
      <ReviewOtherLessonsModal
        studentName="Emily"
        lessons={[
          lessonRow({ id: 'l1', unit: 1, lesson_in_unit: 1, title: 'Fractions' }),
          lessonRow({ id: 'l2', unit: 1, lesson_in_unit: 2, title: 'Decimals' }),
        ]}
        flaggedLessonIds={new Set(['l2'])}
        onToggleLesson={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('checkbox', { name: '1.1 - Fractions' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: '1.2 - Decimals' })).toBeChecked()
  })

  it('lists lessons ahead of the student\'s current position as flaggable, same as any other lesson', () => {
    // The modal takes no notion of "current position" at all -- every lesson
    // passed in is rendered and checkable, regardless of where the student
    // currently is (#153).
    render(
      <ReviewOtherLessonsModal
        studentName="Emily"
        lessons={[
          lessonRow({ id: 'l1', unit: 1, lesson_in_unit: 1, title: 'Fractions' }),
          lessonRow({ id: 'l5', unit: 3, lesson_in_unit: 4, title: 'Algebra Basics' }),
        ]}
        flaggedLessonIds={new Set()}
        onToggleLesson={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const aheadCheckbox = screen.getByRole('checkbox', { name: '3.4 - Algebra Basics' })
    expect(aheadCheckbox).toBeInTheDocument()
    expect(aheadCheckbox).toBeEnabled()
  })

  it('calls onToggleLesson with the clicked row\'s lesson when checking an unflagged lesson', () => {
    const onToggleLesson = vi.fn()
    const decimals = lessonRow({ id: 'l2', unit: 1, lesson_in_unit: 2, title: 'Decimals' })
    render(
      <ReviewOtherLessonsModal
        studentName="Emily"
        lessons={[lessonRow({ id: 'l1', unit: 1, lesson_in_unit: 1, title: 'Fractions' }), decimals]}
        flaggedLessonIds={new Set()}
        onToggleLesson={onToggleLesson}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: '1.2 - Decimals' }))

    expect(onToggleLesson).toHaveBeenCalledWith(decimals)
    expect(onToggleLesson).toHaveBeenCalledTimes(1)
  })

  it('calls onToggleLesson when unchecking an already-flagged lesson', () => {
    const onToggleLesson = vi.fn()
    const decimals = lessonRow({ id: 'l2', unit: 1, lesson_in_unit: 2, title: 'Decimals' })
    render(
      <ReviewOtherLessonsModal
        studentName="Emily"
        lessons={[decimals]}
        flaggedLessonIds={new Set(['l2'])}
        onToggleLesson={onToggleLesson}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: '1.2 - Decimals' }))

    expect(onToggleLesson).toHaveBeenCalledWith(decimals)
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <ReviewOtherLessonsModal
        studentName="Emily"
        lessons={[lessonRow()]}
        flaggedLessonIds={new Set()}
        onToggleLesson={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(
      <ReviewOtherLessonsModal
        studentName="Emily"
        lessons={[lessonRow()]}
        flaggedLessonIds={new Set()}
        onToggleLesson={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('dialog').parentElement!)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when the dialog content itself is clicked', () => {
    const onClose = vi.fn()
    render(
      <ReviewOtherLessonsModal
        studentName="Emily"
        lessons={[lessonRow()]}
        flaggedLessonIds={new Set()}
        onToggleLesson={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('dialog'))

    expect(onClose).not.toHaveBeenCalled()
  })
})
