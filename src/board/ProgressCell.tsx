import type { ProgressRow } from '../db/schema'
import { formatStep } from './formatStep'

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <line x1="5" y1="3" x2="5" y2="21" />
      <path d="M5 4 L19 8 L5 13 Z" />
    </svg>
  )
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
  const isFlagged = Boolean(progress?.review)

  return (
    <div className={`progress-cell${isFlagged ? ' progress-cell--review' : ''}`}>
      <span className="progress-cell__student">{studentName}</span>
      <span className="progress-cell__step">{formatStep(progress)}</span>
      <div className="progress-cell__actions">
        <button
          type="button"
          className={`progress-cell__review-toggle${isFlagged ? ' progress-cell__review-toggle--active' : ''}`}
          onClick={onToggleReview}
          aria-label={isFlagged ? 'Remove review flag' : 'Flag for review'}
        >
          <FlagIcon />
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
