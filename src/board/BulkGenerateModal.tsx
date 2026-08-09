import { useState, type FormEvent } from 'react'
import { generateAiCurriculum, type GeneratedLesson } from '../api/aiBulkGeneration'
import { bulkGenerateLessons, replaceLessonsFromAiGeneration } from '../db'
import { groupLessonsByUnit } from './groupLessonsByUnit'
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
 *
 * #217 wires that screen up to the real generate-preview-commit flow: a
 * loading screen while POST /ai-bulk-generation is in flight, then (on a
 * `found` result) a read-only confirm screen grouping the proposed lessons
 * by unit before anything is written. "Replace curriculum" is the only
 * write -- replaceLessonsFromAiGeneration soft-deletes the subject's
 * existing lessons and creates the proposed ones in one call, mirroring the
 * manual form's submitting/onClose flow. A `not-found` result or a thrown
 * error both fall back to the curriculum-name screen for now; #220 gives
 * each its own dedicated screen with a "Try again" action.
 */
type Screen = 'manual' | 'auto' | 'auto-loading' | 'auto-confirm'

export function BulkGenerateModal({ subjectId, onClose, onGenerated }: BulkGenerateModalProps) {
  const [screen, setScreen] = useState<Screen>('manual')
  const [units, setUnits] = useState('')
  const [lessonsPerUnit, setLessonsPerUnit] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [curriculumName, setCurriculumName] = useState('')
  const [generatedLessons, setGeneratedLessons] = useState<GeneratedLesson[]>([])
  const [committing, setCommitting] = useState(false)

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

  async function handleGenerate() {
    if (!canGenerate) return

    setScreen('auto-loading')
    try {
      const result = await generateAiCurriculum(curriculumName)
      if (result.status === 'found') {
        setGeneratedLessons(result.lessons)
        setScreen('auto-confirm')
      } else {
        // `not-found` -- #220 gives this its own screen; for now, back to
        // the curriculum-name screen with the typed name still in place.
        setScreen('auto')
      }
    } catch {
      // Generic failure -- same fallback as `not-found` until #220.
      setScreen('auto')
    }
  }

  async function handleReplaceCurriculum() {
    if (committing) return

    setCommitting(true)
    await replaceLessonsFromAiGeneration(subjectId, generatedLessons)
    setCommitting(false)
    onClose()
  }

  const generatedUnitGroups = groupLessonsByUnit(generatedLessons)

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
          <h2>{screen === 'manual' ? 'Bulk Generate' : 'Auto-generate Curriculum'}</h2>
          <button type="button" aria-label="Close" className="bulk-generate-modal__close" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {screen === 'manual' && (
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
        {screen === 'auto' && (
          <div className="inline-add-card__form">
            <button type="button" className="bulk-generate-modal__back" onClick={() => setScreen('manual')}>
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
              <button type="button" disabled={!canGenerate} onClick={() => void handleGenerate()}>
                Generate
              </button>
            </div>
          </div>
        )}
        {screen === 'auto-loading' && (
          <div className="inline-add-card__form">
            <p>Generating curriculum… this can take up to a minute.</p>
          </div>
        )}
        {screen === 'auto-confirm' && (
          <div className="inline-add-card__form">
            <p className="bulk-generate-modal__confirm-count">
              {generatedLessons.length} lesson{generatedLessons.length === 1 ? '' : 's'} across{' '}
              {generatedUnitGroups.length} unit{generatedUnitGroups.length === 1 ? '' : 's'}
            </p>
            <ul className="bulk-generate-modal__confirm-list">
              {generatedUnitGroups.map((group) => (
                <li key={group.unit}>
                  <h3>Unit {group.unit}</h3>
                  <ul>
                    {group.lessons.map((lesson) => (
                      <li key={`${lesson.unit}.${lesson.lesson_in_unit}`}>{lesson.title}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <div className="inline-add-card__actions">
              <button type="button" onClick={() => setScreen('auto')}>
                Cancel
              </button>
              <button type="button" disabled={committing} onClick={() => void handleReplaceCurriculum()}>
                Replace curriculum
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
