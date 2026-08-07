import { useState, type FormEvent } from 'react'
import { bulkGenerateLessons } from '../db'
import './BulkGenerateModal.css'

interface BulkGenerateModalProps {
  subjectId: string
  onClose: () => void
}

const MIN_COUNT = 1
const MAX_COUNT = 50

/** Clamps a numeric-input string to at most MAX_COUNT, leaving everything else (including blank, non-numeric, or below-minimum values) untouched -- those are instead caught by canSubmit so the field can still show its own in-progress typing/validation state. */
function clampToMax(value: string): string {
  const num = Number(value)
  if (value.trim() !== '' && Number.isFinite(num) && num > MAX_COUNT) {
    return String(MAX_COUNT)
  }
  return value
}

function isValidCount(value: string): boolean {
  const num = Number(value)
  return value.trim() !== '' && Number.isInteger(num) && num >= MIN_COUNT && num <= MAX_COUNT
}

/**
 * "Bulk Generate" (#163): a sibling to AddLessonModal (ADR-0008), reusing the
 * same backdrop/dialog/header-with-close-button structure. Two required
 * number inputs, Units and Lessons per unit, each clamped client-side to
 * [1, 50] -- a UI guardrail only, not a domain rule -- gate submission via the
 * same canSubmit pattern AddLessonModal uses. Submitting calls the #162
 * db-layer bulkGenerateLessons directly (no preview/confirmation step) and
 * closes the dialog once it resolves, mirroring AddLessonModal's
 * submitting/onClose flow so generated lessons sync the same way any other
 * locally-created lesson already does.
 */
export function BulkGenerateModal({ subjectId, onClose }: BulkGenerateModalProps) {
  const [units, setUnits] = useState('')
  const [lessonsPerUnit, setLessonsPerUnit] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = isValidCount(units) && isValidCount(lessonsPerUnit)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit || submitting) return

    setSubmitting(true)
    await bulkGenerateLessons(subjectId, Number(units), Number(lessonsPerUnit))
    setSubmitting(false)
    onClose()
  }

  return (
    <div className="bulk-generate-modal__backdrop" onClick={onClose}>
      <div
        className="bulk-generate-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Bulk Generate"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bulk-generate-modal__header">
          <h2>Bulk Generate</h2>
          <button type="button" aria-label="Close" className="bulk-generate-modal__close" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <form className="inline-add-card__form" onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="bulk-generate-units">Units</label>
          <input
            id="bulk-generate-units"
            type="number"
            min={MIN_COUNT}
            max={MAX_COUNT}
            value={units}
            onChange={(event) => setUnits(clampToMax(event.target.value))}
            autoFocus
          />
          <label htmlFor="bulk-generate-lessons-per-unit">Lessons per unit</label>
          <input
            id="bulk-generate-lessons-per-unit"
            type="number"
            min={MIN_COUNT}
            max={MAX_COUNT}
            value={lessonsPerUnit}
            onChange={(event) => setLessonsPerUnit(clampToMax(event.target.value))}
          />
          <div className="inline-add-card__actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={submitting || !canSubmit}>
              Generate
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
