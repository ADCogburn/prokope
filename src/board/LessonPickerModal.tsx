import type { LessonRow } from '../db/schema'
import type { ProgressStep } from '../db'
import { formatLessonLabel } from '../db'
import './LessonPickerModal.css'

interface LessonPickerModalProps {
  studentName: string
  lessons: LessonRow[]
  currentPosition: ProgressStep
  onSelectLesson: (lesson: LessonRow) => void
  onClose: () => void
}

function isCurrentPosition(lesson: LessonRow, currentPosition: ProgressStep) {
  return lesson.unit === currentPosition.unit && lesson.lesson_in_unit === currentPosition.lesson_in_unit
}

/**
 * Lists every lesson in a subject's curriculum so a teacher can jump a
 * student directly to an arbitrary one, forward or backward (#44). Follows
 * the SubjectPickerModal pattern per ADR-0003: modals are reserved for
 * picking among existing items. Purely presentational -- selecting a row
 * and closing (backdrop, close button) are both left to the caller.
 */
export function LessonPickerModal({
  studentName,
  lessons,
  currentPosition,
  onSelectLesson,
  onClose,
}: LessonPickerModalProps) {
  return (
    <div className="lesson-picker-modal__backdrop" onClick={onClose}>
      <div
        className="lesson-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Jump ${studentName} to lesson`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="lesson-picker-modal__header">
          <h2>Jump {studentName} to lesson</h2>
          <button type="button" aria-label="Close" className="lesson-picker-modal__close" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <ul className="lesson-picker-modal__list">
          {lessons.map((lesson) => {
            const isCurrent = isCurrentPosition(lesson, currentPosition)
            return (
              <li key={lesson.id}>
                <button
                  type="button"
                  className={`lesson-picker-modal__item${isCurrent ? ' lesson-picker-modal__item--current' : ''}`}
                  onClick={() => onSelectLesson(lesson)}
                >
                  <span>{formatLessonLabel(lesson)}</span>
                  {isCurrent && <span aria-hidden="true">✓</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
