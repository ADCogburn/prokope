import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressCell } from './ProgressCell'
import type { ProgressRow } from '../db/schema'

function progressRow(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    id: 'p1',
    student_id: 's1',
    subject_id: 'subj1',
    step_unit: 1,
    step_lesson_in_unit: 2,
    step_hlc: 'hlc',
    step_client_id: 'client',
    review: false,
    review_hlc: 'hlc',
    review_client_id: 'client',
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('ProgressCell', () => {
  it('shows "Next lesson" and an enabled advance button when a next lesson exists', () => {
    render(
      <ProgressCell
        studentName="Emily"
        progress={undefined}
        hasNextLesson
        hasAnyLessons
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Next lesson' })).toBeEnabled()
  })

  it('shows a disabled "Complete" button when there is no next lesson but lessons exist', () => {
    render(
      <ProgressCell
        studentName="Emily"
        progress={progressRow()}
        hasNextLesson={false}
        hasAnyLessons
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Complete' })).toBeDisabled()
  })

  it('shows a disabled "No lessons yet" button when the subject has no lessons at all', () => {
    render(
      <ProgressCell
        studentName="Emily"
        progress={undefined}
        hasNextLesson={false}
        hasAnyLessons={false}
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'No lessons yet' })).toBeDisabled()
  })

  it('calls onAdvance when the advance button is clicked', () => {
    const onAdvance = vi.fn()
    render(
      <ProgressCell
        studentName="Emily"
        progress={undefined}
        hasNextLesson
        hasAnyLessons
        onAdvance={onAdvance}
        onToggleReview={vi.fn()}
      />,
    )

    screen.getByRole('button', { name: 'Next lesson' }).click()
    expect(onAdvance).toHaveBeenCalledTimes(1)
  })

  it('calls onToggleReview when the review toggle is clicked, and reflects the flagged state via aria-label', () => {
    const onToggleReview = vi.fn()
    render(
      <ProgressCell
        studentName="Emily"
        progress={progressRow({ review: true })}
        hasNextLesson
        hasAnyLessons
        onAdvance={vi.fn()}
        onToggleReview={onToggleReview}
      />,
    )

    const button = screen.getByRole('button', { name: 'Remove review flag' })
    button.click()
    expect(onToggleReview).toHaveBeenCalledTimes(1)
  })

  it('labels the review toggle "Flag for review" when unflagged, without an active class', () => {
    render(
      <ProgressCell
        studentName="Emily"
        progress={progressRow({ review: false })}
        hasNextLesson
        hasAnyLessons
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', { name: 'Flag for review' })
    expect(button.className).not.toContain('progress-cell__review-toggle--active')
  })

  it('adds the active class to the review toggle when flagged', () => {
    render(
      <ProgressCell
        studentName="Emily"
        progress={progressRow({ review: true })}
        hasNextLesson
        hasAnyLessons
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', { name: 'Remove review flag' })
    expect(button.className).toContain('progress-cell__review-toggle--active')
  })
})
