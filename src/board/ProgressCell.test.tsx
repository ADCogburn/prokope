import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ProgressCell } from './ProgressCell'
import type { LessonRow, ProgressRow } from '../db/schema'

function progressRow(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    id: 'p1',
    student_id: 's1',
    subject_id: 'subj1',
    step_unit: 1,
    step_lesson_in_unit: 2,
    step_hlc: 'hlc',
    step_client_id: 'client',
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function lessonRow(overrides: Partial<LessonRow> = {}): LessonRow {
  return {
    id: 'l1',
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

describe('ProgressCell', () => {
  it('shows "Next lesson" and an enabled advance button when a next lesson exists', () => {
    render(
      <ProgressCell
        studentName="Emily"
        progress={undefined}
        isFlagged={false}
        hasNextLesson
        hasAnyLessons
        subjectLessons={[lessonRow()]}
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
        onJumpToLesson={vi.fn()}
        onReviewOtherLessons={vi.fn()}
        onUnAdvance={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Next lesson' })).toBeEnabled()
  })

  it('shows a disabled "Complete" button when there is no next lesson but lessons exist', () => {
    render(
      <ProgressCell
        studentName="Emily"
        progress={progressRow()}
        isFlagged={false}
        hasNextLesson={false}
        hasAnyLessons
        subjectLessons={[lessonRow()]}
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
        onJumpToLesson={vi.fn()}
        onReviewOtherLessons={vi.fn()}
        onUnAdvance={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Complete' })).toBeDisabled()
  })

  it('shows a disabled "No lessons yet" button when the subject has no lessons at all', () => {
    render(
      <ProgressCell
        studentName="Emily"
        progress={undefined}
        isFlagged={false}
        hasNextLesson={false}
        hasAnyLessons={false}
        subjectLessons={[]}
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
        onJumpToLesson={vi.fn()}
        onReviewOtherLessons={vi.fn()}
        onUnAdvance={vi.fn()}
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
        isFlagged={false}
        hasNextLesson
        hasAnyLessons
        subjectLessons={[lessonRow()]}
        onAdvance={onAdvance}
        onToggleReview={vi.fn()}
        onJumpToLesson={vi.fn()}
        onReviewOtherLessons={vi.fn()}
        onUnAdvance={vi.fn()}
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
        progress={progressRow()}
        isFlagged={true}
        hasNextLesson
        hasAnyLessons
        subjectLessons={[lessonRow()]}
        onAdvance={vi.fn()}
        onToggleReview={onToggleReview}
        onJumpToLesson={vi.fn()}
        onReviewOtherLessons={vi.fn()}
        onUnAdvance={vi.fn()}
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
        progress={progressRow()}
        isFlagged={false}
        hasNextLesson
        hasAnyLessons
        subjectLessons={[lessonRow()]}
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
        onJumpToLesson={vi.fn()}
        onReviewOtherLessons={vi.fn()}
        onUnAdvance={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', { name: 'Flag for review' })
    expect(button.className).not.toContain('progress-cell__review-toggle--active')
  })

  it('adds the active class to the review toggle when flagged', () => {
    render(
      <ProgressCell
        studentName="Emily"
        progress={progressRow()}
        isFlagged={true}
        hasNextLesson
        hasAnyLessons
        subjectLessons={[lessonRow()]}
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
        onJumpToLesson={vi.fn()}
        onReviewOtherLessons={vi.fn()}
        onUnAdvance={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', { name: 'Remove review flag' })
    expect(button.className).toContain('progress-cell__review-toggle--active')
  })

  it('does not apply any background-highlight class to the cell regardless of flagged state (#152/ADR-0011)', () => {
    const { container } = render(
      <ProgressCell
        studentName="Emily"
        progress={progressRow()}
        isFlagged={true}
        hasNextLesson
        hasAnyLessons
        subjectLessons={[lessonRow()]}
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
        onJumpToLesson={vi.fn()}
        onReviewOtherLessons={vi.fn()}
        onUnAdvance={vi.fn()}
      />,
    )

    const cell = container.querySelector('.progress-cell')
    expect(cell?.className).toBe('progress-cell')
  })

  it('right-click opens a context menu with a "Jump to lesson..." item', () => {
    render(
      <ProgressCell
        studentName="Emily"
        progress={undefined}
        isFlagged={false}
        hasNextLesson
        hasAnyLessons
        subjectLessons={[lessonRow()]}
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
        onJumpToLesson={vi.fn()}
        onReviewOtherLessons={vi.fn()}
        onUnAdvance={vi.fn()}
      />,
    )

    expect(screen.queryByRole('menuitem', { name: 'Jump to lesson...' })).not.toBeInTheDocument()

    fireEvent.contextMenu(screen.getByText('Emily'))

    expect(screen.getByRole('menuitem', { name: 'Jump to lesson...' })).toBeInTheDocument()
  })

  it('disables "Jump to lesson..." when the subject has no lessons', () => {
    render(
      <ProgressCell
        studentName="Emily"
        progress={undefined}
        isFlagged={false}
        hasNextLesson={false}
        hasAnyLessons={false}
        subjectLessons={[]}
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
        onJumpToLesson={vi.fn()}
        onReviewOtherLessons={vi.fn()}
        onUnAdvance={vi.fn()}
      />,
    )

    fireEvent.contextMenu(screen.getByText('Emily'))

    expect(screen.getByRole('menuitem', { name: 'Jump to lesson...' })).toBeDisabled()
  })

  it('calls onJumpToLesson when "Jump to lesson..." is selected', () => {
    const onJumpToLesson = vi.fn()
    render(
      <ProgressCell
        studentName="Emily"
        progress={undefined}
        isFlagged={false}
        hasNextLesson
        hasAnyLessons
        subjectLessons={[lessonRow()]}
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
        onJumpToLesson={onJumpToLesson}
        onReviewOtherLessons={vi.fn()}
        onUnAdvance={vi.fn()}
      />,
    )

    fireEvent.contextMenu(screen.getByText('Emily'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Jump to lesson...' }))

    expect(onJumpToLesson).toHaveBeenCalledTimes(1)
  })

  it('right-click opens a context menu with an enabled "Un-advance" item when progress is underway', () => {
    render(
      <ProgressCell
        studentName="Emily"
        progress={progressRow({ step_unit: 1, step_lesson_in_unit: 2 })}
        isFlagged={false}
        hasNextLesson
        hasAnyLessons
        subjectLessons={[lessonRow()]}
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
        onJumpToLesson={vi.fn()}
        onReviewOtherLessons={vi.fn()}
        onUnAdvance={vi.fn()}
      />,
    )

    fireEvent.contextMenu(screen.getByText('Emily'))

    expect(screen.getByRole('menuitem', { name: 'Un-advance' })).toBeEnabled()
  })

  it('disables "Un-advance" when the student has no progress yet (at {0, 0} "Not started")', () => {
    render(
      <ProgressCell
        studentName="Emily"
        progress={undefined}
        isFlagged={false}
        hasNextLesson
        hasAnyLessons
        subjectLessons={[lessonRow()]}
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
        onJumpToLesson={vi.fn()}
        onReviewOtherLessons={vi.fn()}
        onUnAdvance={vi.fn()}
      />,
    )

    fireEvent.contextMenu(screen.getByText('Emily'))

    expect(screen.getByRole('menuitem', { name: 'Un-advance' })).toBeDisabled()
  })

  it('disables "Un-advance" when progress is explicitly at {0, 0} "Not started"', () => {
    render(
      <ProgressCell
        studentName="Emily"
        progress={progressRow({ step_unit: 0, step_lesson_in_unit: 0 })}
        isFlagged={false}
        hasNextLesson
        hasAnyLessons
        subjectLessons={[lessonRow()]}
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
        onJumpToLesson={vi.fn()}
        onReviewOtherLessons={vi.fn()}
        onUnAdvance={vi.fn()}
      />,
    )

    fireEvent.contextMenu(screen.getByText('Emily'))

    expect(screen.getByRole('menuitem', { name: 'Un-advance' })).toBeDisabled()
  })

  it('calls onUnAdvance when "Un-advance" is selected', () => {
    const onUnAdvance = vi.fn()
    render(
      <ProgressCell
        studentName="Emily"
        progress={progressRow({ step_unit: 1, step_lesson_in_unit: 2 })}
        isFlagged={false}
        hasNextLesson
        hasAnyLessons
        subjectLessons={[lessonRow()]}
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
        onJumpToLesson={vi.fn()}
        onReviewOtherLessons={vi.fn()}
        onUnAdvance={onUnAdvance}
      />,
    )

    fireEvent.contextMenu(screen.getByText('Emily'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Un-advance' }))

    expect(onUnAdvance).toHaveBeenCalledTimes(1)
  })

  it('right-click opens a context menu with a "Review other lessons" item, distinct from "Jump to lesson..." (#153)', () => {
    render(
      <ProgressCell
        studentName="Emily"
        progress={undefined}
        isFlagged={false}
        hasNextLesson
        hasAnyLessons
        subjectLessons={[lessonRow()]}
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
        onJumpToLesson={vi.fn()}
        onReviewOtherLessons={vi.fn()}
        onUnAdvance={vi.fn()}
      />,
    )

    expect(screen.queryByRole('menuitem', { name: 'Review other lessons' })).not.toBeInTheDocument()

    fireEvent.contextMenu(screen.getByText('Emily'))

    const jumpItem = screen.getByRole('menuitem', { name: 'Jump to lesson...' })
    const reviewItem = screen.getByRole('menuitem', { name: 'Review other lessons' })
    expect(jumpItem).toBeInTheDocument()
    expect(reviewItem).toBeInTheDocument()
    expect(reviewItem).not.toBe(jumpItem)
  })

  it('disables "Review other lessons" when the subject has no lessons', () => {
    render(
      <ProgressCell
        studentName="Emily"
        progress={undefined}
        isFlagged={false}
        hasNextLesson={false}
        hasAnyLessons={false}
        subjectLessons={[]}
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
        onJumpToLesson={vi.fn()}
        onReviewOtherLessons={vi.fn()}
        onUnAdvance={vi.fn()}
      />,
    )

    fireEvent.contextMenu(screen.getByText('Emily'))

    expect(screen.getByRole('menuitem', { name: 'Review other lessons' })).toBeDisabled()
  })

  it('calls onReviewOtherLessons when "Review other lessons" is selected, without calling onJumpToLesson', () => {
    const onReviewOtherLessons = vi.fn()
    const onJumpToLesson = vi.fn()
    render(
      <ProgressCell
        studentName="Emily"
        progress={undefined}
        isFlagged={false}
        hasNextLesson
        hasAnyLessons
        subjectLessons={[lessonRow()]}
        onAdvance={vi.fn()}
        onToggleReview={vi.fn()}
        onJumpToLesson={onJumpToLesson}
        onReviewOtherLessons={onReviewOtherLessons}
        onUnAdvance={vi.fn()}
      />,
    )

    fireEvent.contextMenu(screen.getByText('Emily'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Review other lessons' }))

    expect(onReviewOtherLessons).toHaveBeenCalledTimes(1)
    expect(onJumpToLesson).not.toHaveBeenCalled()
  })
})
