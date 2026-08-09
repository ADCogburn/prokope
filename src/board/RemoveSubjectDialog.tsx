import { useEffect } from 'react'
import type { SubjectRow } from '../db/schema'
import './RemoveSubjectDialog.css'

interface RemoveSubjectDialogProps {
  subject: SubjectRow
  onConfirm: () => void
  onClose: () => void
}

/**
 * Confirms removing a subject before the soft-delete write happens (#193),
 * mirroring RemoveStudentDialog/RemoveLessonDialog's shape and interaction
 * pattern exactly: a backdrop that closes on click, an inner dialog with
 * click-through suppressed, and Escape as a dismiss gesture -- reached via a
 * right-click menu (ADR-0006) whose ContextMenu already treats Escape as a
 * dismiss gesture.
 */
export function RemoveSubjectDialog({ subject, onConfirm, onClose }: RemoveSubjectDialogProps) {
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
    <div className="remove-subject-dialog__backdrop" onClick={onClose}>
      <div
        className="remove-subject-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Remove subject"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Remove {subject.name}?</h2>
        <p>Removing {subject.name} hides its lessons and every student's progress in it.</p>
        <div className="remove-subject-dialog__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="remove-subject-dialog__confirm" onClick={onConfirm}>
            Remove subject
          </button>
        </div>
      </div>
    </div>
  )
}
