import { useState, type FormEvent } from 'react'
import { bulkGenerateLessons } from '../db'
import './BulkGenerateModal.css'

interface BulkGenerateModalProps {
  subjectId: string
  onClose: () => void
  /**
   * Reports the ids of lessons actually created by this submission, right
   * before onClose() fires -- lets the parent (Curriculum, #164) capture a
   * one-shot Undo batch. Not called on cancel/backdrop/close-button
   * dismissal, only after a successful bulkGenerateLessons call.
   */
  onGenerated?: (ids: string[]) => void
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
 *
 * #216 adds a second screen behind an "Auto-generate" toggle (ADR-0019):
 * swaps this manual form for a blank curriculum-name input, with "Back" to
 * return. Purely a mode switch -- no network call happens here yet.
 */
type Screen = 'manual' | 'auto'

export function BulkGenerateModal({ subjectId, onClose, onGenerated }: BulkGenerateModalProps) {
  const [screen, setScreen] = useState<Screen>('manual')
  const [units, setUnits] = useState('')
  const [lessonsPerUnit, setLessonsPerUnit] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [curriculumName, setCurriculumName] = useState('')

  const canSubmit = isValidCount(units) && isValidCount(lessonsPerUnit)
  const canGenerate = curriculumName.trim() !== ''

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit || submitting) return

    setSubmitting(true)
    const createdIds = await bulkGenerateLessons(subjectId, Number(units), Number(lessonsPerUnit))
    setSubmitting(false)
    onGenerated?.(createdIds)
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
          <h2>{screen === 'auto' ? 'Auto-generate Curriculum' : 'Bulk Generate'}</h2>
          <button type="button" aria-label="Close" className="bulk-generate-modal__close" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {screen === 'auto' ? (
          <div className="inline-add-card__form">
            <button
              type="button"
              className="bulk-generate-modal__back"
              onClick={() => setScreen('manual')}
            >
              Back
            </button>
            <label htmlFor="bulk-generate-curriculum-name">Curriculum name</label>
            <input
              id="bulk-generate-curriculum-name"
              type="text"
              value={curriculumName}
              onChange={(event) => setCurriculumName(event.target.value)}
              autoFocus
            />
            <div className="inline-add-card__actions">
              <button type="button" disabled={!canGenerate}>
                Generate
              </button>
            </div>
          </div>
        ) : (
          <form className="inline-add-card__form" onSubmit={(event) => void handleSubmit(event)}>
            <button
              type="button"
              className="bulk-generate-modal__auto-generate"
              onClick={() => setScreen('auto')}
            >
              Auto-generate
            </button>
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
        )}
      </div>
    </div>
  )
}
