import type { ProgressRow } from '../db/schema'

export function formatStep(progress: ProgressRow | undefined): string {
  if (!progress || (progress.step_unit === 0 && progress.step_lesson_in_unit === 0)) {
    return 'Not started'
  }
  return `Unit ${progress.step_unit} · Lesson ${progress.step_lesson_in_unit}`
}

interface ProgressCellProps {
  studentName: string
  progress: ProgressRow | undefined
  hasNextLesson: boolean
  hasAnyLessons: boolean
  onAdvance: () => void
  onToggleReview: () => void
}

/** One subject x student cell on the class board: current step, a progress-advance control (per #22's addendum), and a review-flag toggle. */
export function ProgressCell({
  studentName,
  progress,
  hasNextLesson,
  hasAnyLessons,
  onAdvance,
  onToggleReview,
}: ProgressCellProps) {
  const advanceLabel = !hasAnyLessons ? 'No lessons yet' : hasNextLesson ? 'Next lesson' : 'Complete'

  return (
    <div className={`progress-cell${progress?.review ? ' progress-cell--review' : ''}`}>
      <span className="progress-cell__student">{studentName}</span>
      <span className="progress-cell__step">{formatStep(progress)}</span>
      <div className="progress-cell__actions">
        <button
          type="button"
          className={`progress-cell__review-toggle${progress?.review ? ' progress-cell__review-toggle--active' : ''}`}
          onClick={onToggleReview}
        >
          {progress?.review ? 'Flagged' : 'Flag for review'}
        </button>
        <button
          type="button"
          className="progress-cell__advance"
          onClick={onAdvance}
          disabled={!hasNextLesson}
        >
          {advanceLabel}
        </button>
      </div>
    </div>
  )
}
