import type { LessonRow } from '../db/schema'
import { formatLessonLabel } from '../db'
import './ReviewOtherLessonsModal.css'

interface ReviewOtherLessonsModalProps {
  studentName: string
  lessons: LessonRow[]
  flaggedLessonIds: Set<string>
  onToggleLesson: (lesson: LessonRow) => void
  onClose: () => void
}

/**
 * Lists every lesson in a subject's curriculum with a checkbox per lesson
 * reflecting/toggling its ReviewFlag (#152/ADR-0011), so a teacher can mark
 * any lesson for review -- past, current, or ahead of the student's
 * position -- without moving that position (#153, per ADR-0012: kept
 * separate from "Jump to lesson...", which is a select-and-navigate action
 * of a different shape than this flag-only checklist).
 *
 * Structurally a sibling to LessonPickerModal (same "list every lesson in
 * one subject, in curriculum order" shape and the same purely-presentational
 * convention: toggling a row only reports the request up to the caller,
 * which owns the actual upsertReviewFlag write, mirroring how
 * onSelectLesson defers the jumpToLesson call) rather than a modification of
 * it, since a checklist is a different shape than a picker-that-navigates.
 */
export function ReviewOtherLessonsModal({
  studentName,
  lessons,
  flaggedLessonIds,
  onToggleLesson,
  onClose,
}: ReviewOtherLessonsModalProps) {
  return (
    <div className="review-other-lessons-modal__backdrop" onClick={onClose}>
      <div
        className="review-other-lessons-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Mark lessons for review for ${studentName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="review-other-lessons-modal__header">
          <h2>Mark lessons for review</h2>
          <button
            type="button"
            aria-label="Close"
            className="review-other-lessons-modal__close"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <ul className="review-other-lessons-modal__list">
          {lessons.map((lesson) => {
            const flagged = flaggedLessonIds.has(lesson.id)
            return (
              <li key={lesson.id}>
                <label className="review-other-lessons-modal__item">
                  <input
                    type="checkbox"
                    checked={flagged}
                    onChange={() => onToggleLesson(lesson)}
                  />
                  <span>{formatLessonLabel(lesson)}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
