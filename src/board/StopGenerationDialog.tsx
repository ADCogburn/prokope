import { useEffect } from 'react'
import './StopGenerationDialog.css'

interface StopGenerationDialogProps {
  onConfirm: () => void
  onClose: () => void
}

/**
 * Confirms cancelling an in-flight AI Bulk Generation request before it's
 * aborted (#219). Mirrors RemoveLessonDialog's shape and interaction pattern
 * exactly: a backdrop that closes (stays) on click, an inner dialog with
 * click-through suppressed, and Escape as a "stay" gesture. Rendered as an
 * overlay on top of BulkGenerateModal's own backdrop while its loading
 * screen is showing.
 */
export function StopGenerationDialog({ onConfirm, onClose }: StopGenerationDialogProps) {
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
    <div className="stop-generation-dialog__backdrop" onClick={onClose}>
      <div
        className="stop-generation-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Stop generation"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Stop generation?</h2>
        <p>Generation is still in progress. Stopping now will cancel it and close this dialog.</p>
        <div className="stop-generation-dialog__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="stop-generation-dialog__confirm" onClick={onConfirm}>
            Stop generation
          </button>
        </div>
      </div>
    </div>
  )
}
