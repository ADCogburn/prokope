import { useState } from 'react'
import type { LessonRow, ProgressRow } from '../db/schema'
import { positionOf } from '../db'
import { formatStep } from './formatStep'
import { ContextMenu } from './ContextMenu'

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
  /**
   * Whether the ReviewFlag for the student's *current* lesson in this
   * subject is set -- computed by the caller (ClassBoard), since it needs
   * the ReviewFlag rows for the whole board, not just this cell (#152/
   * ADR-0011). No longer derived from progress.review, which was retired.
   */
  isFlagged: boolean
  hasNextLesson: boolean
  hasAnyLessons: boolean
  subjectLessons: LessonRow[]
  onAdvance: () => void
  onToggleReview: () => void
  onJumpToLesson: () => void
  onReviewOtherLessons: () => void
  onUnAdvance: () => void
}

/**
 * One subject x student cell on the class board: current step, a
 * progress-advance control (per #22's addendum), a review-flag toggle, and
 * (per #44, ADR-0006) a right-click menu offering "Jump to lesson...",
 * "Review other lessons" (#153, per ADR-0012), and (per #77) "Un-advance".
 * onJumpToLesson and onReviewOtherLessons each only report the request up to
 * the caller -- ProgressCell doesn't know which lesson was picked (or which
 * lessons get flagged), since each picker/modal is a single instance owned
 * by the board, not one per cell. onUnAdvance, by contrast, needs no picker
 * and is invoked directly.
 *
 * Per ADR-0012, "Review other lessons" is kept as its own menu item rather
 * than folded into "Jump to lesson...": a flag-only checklist that never
 * moves the student's position is a different shape than a select-and-jump
 * picker, even though both list the same subject's lessons.
 *
 * Per #152/ADR-0011, the review flag no longer drives any background
 * highlight on the cell itself -- only the toggle icon's own fill reflects
 * `isFlagged`. Not shown as a highlight on Class Board subject panels; see
 * CONTEXT.md's "Review flag" glossary entry.
 */
export function ProgressCell({
  studentName,
  progress,
  isFlagged,
  hasNextLesson,
  hasAnyLessons,
  subjectLessons,
  onAdvance,
  onToggleReview,
  onJumpToLesson,
  onReviewOtherLessons,
  onUnAdvance,
}: ProgressCellProps) {
  const advanceLabel = !hasAnyLessons ? 'No lessons yet' : hasNextLesson ? 'Next lesson' : 'Complete'
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const position = positionOf(progress)
  const isNotStarted = position.unit === 0 && position.lesson_in_unit === 0

  return (
    <div
      className="progress-cell"
      onContextMenu={(event) => {
        event.preventDefault()
        setMenuPosition({ x: event.clientX, y: event.clientY })
      }}
    >
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
      {menuPosition && (
        <ContextMenu
          x={menuPosition.x}
          y={menuPosition.y}
          onClose={() => setMenuPosition(null)}
          items={[
            {
              label: 'Jump to lesson...',
              onSelect: onJumpToLesson,
              disabled: subjectLessons.length === 0,
            },
            {
              label: 'Review other lessons',
              onSelect: onReviewOtherLessons,
              disabled: subjectLessons.length === 0,
            },
            {
              label: 'Un-advance',
              onSelect: onUnAdvance,
              disabled: isNotStarted,
            },
          ]}
        />
      )}
    </div>
  )
}
