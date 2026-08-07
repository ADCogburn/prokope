import { useEffect } from 'react'
import type { LessonRow } from '../db/schema'
import './RemoveLessonDialog.css'

interface RemoveLessonDialogProps {
  lesson: LessonRow
  onConfirm: () => void
  onClose: () => void
}

/**
 * Confirms removing a lesson before the soft-delete write happens (#136),
 * replacing a native confirm() popup. Mirrors RemoveStudentDialog's shape and
 * interaction pattern exactly (#78): a backdrop that closes on click, an
 * inner dialog with click-through suppressed, and Escape as a dismiss
 * gesture.
 */
export function RemoveLessonDialog({ lesson, onConfirm, onClose }: RemoveLessonDialogProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="remove-lesson-dialog__backdrop" onClick={onClose}>
      <div
        className="remove-lesson-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Remove lesson"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Remove {lesson.title}?</h2>
        <p>Removing {lesson.title} hides it from the curriculum.</p>
        <div className="remove-lesson-dialog__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="remove-lesson-dialog__confirm" onClick={onConfirm}>
            Remove lesson
          </button>
        </div>
      </div>
    </div>
  )
}
