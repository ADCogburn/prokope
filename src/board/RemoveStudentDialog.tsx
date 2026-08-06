import { useEffect } from 'react'
import type { StudentRow } from '../db/schema'
import './RemoveStudentDialog.css'

interface RemoveStudentDialogProps {
  student: StudentRow
  onConfirm: () => void
  onClose: () => void
}

/**
 * Confirms removing a student before the soft-delete write happens (#78).
 * Follows the SubjectPickerModal/LessonPickerModal pattern per ADR-0003: a
 * backdrop that closes on click, an inner dialog with click-through
 * suppressed. Also closes on Escape -- unlike those picker modals, this one
 * is reached via a right-click menu (ADR-0006), and ContextMenu itself
 * already treats Escape as a dismiss gesture, so the dialog that follows it
 * keeps that same expectation.
 */
export function RemoveStudentDialog({ student, onConfirm, onClose }: RemoveStudentDialogProps) {
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
    <div className="remove-student-dialog__backdrop" onClick={onClose}>
      <div
        className="remove-student-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Remove student"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Remove {student.name}?</h2>
        <p>Removing {student.name} hides all of their progress.</p>
        <div className="remove-student-dialog__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="remove-student-dialog__confirm" onClick={onConfirm}>
            Remove student
          </button>
        </div>
      </div>
    </div>
  )
}
