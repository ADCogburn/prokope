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
  hasNextLesson: boolean
  hasAnyLessons: boolean
  subjectLessons: LessonRow[]
  onAdvance: () => void
  onToggleReview: () => void
  onJumpToLesson: () => void
  onUnAdvance: () => void
}

/**
 * One subject x student cell on the class board: current step, a
 * progress-advance control (per #22's addendum), a review-flag toggle, and
 * (per #44, ADR-0006) a right-click menu offering "Jump to lesson..." and
 * (per #77) "Un-advance". onJumpToLesson only reports the request up to the
 * caller -- ProgressCell doesn't know which lesson was picked, since the
 * picker itself is a single modal instance owned by the board, not one per
 * cell. onUnAdvance, by contrast, needs no picker and is invoked directly.
 */
export function ProgressCell({
  studentName,
  progress,
  hasNextLesson,
  hasAnyLessons,
  subjectLessons,
  onAdvance,
  onToggleReview,
  onJumpToLesson,
  onUnAdvance,
}: ProgressCellProps) {
  const advanceLabel = !hasAnyLessons ? 'No lessons yet' : hasNextLesson ? 'Next lesson' : 'Complete'
  const isFlagged = Boolean(progress?.review)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const position = positionOf(progress)
  const isNotStarted = position.unit === 0 && position.lesson_in_unit === 0

  return (
    <div
      className={`progress-cell${isFlagged ? ' progress-cell--review' : ''}`}
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
