import { useEffect, useRef, useState, type FormEvent } from 'react'
import { generateAiCurriculum, type GeneratedLesson } from '../api/aiBulkGeneration'
import { bulkGenerateLessons, replaceLessonsFromAiGeneration } from '../db'
import { groupLessonsByUnit } from './groupLessonsByUnit'
import { StopGenerationDialog } from './StopGenerationDialog'
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
 * manual form's submitting/onClose flow.
 *
 * #219 guards against losing an in-flight generation to an accidental click:
 * closing the modal (x/backdrop) or clicking "Back" while the loading screen
 * is showing routes through requestClose(), which shows StopGenerationDialog
 * instead of closing directly. Confirming aborts the request (via the
 * AbortController threaded into generateAiCurriculum) and closes the modal;
 * declining just dismisses the dialog. Leaving the Curriculum page entirely
 * unmounts this component, which aborts any in-flight request the same way,
 * with no navigation blocking or dialog.
 *
 * #220 gives a `not-found` result and a thrown error each their own screen
 * (`auto-not-found` / `auto-error`) with a visibly distinct message -- the
 * `not-found` message comes straight from the endpoint's response, the
 * generic-error one is static -- and a "Try again" that resubmits the
 * curriculum name still sitting in the retained input, no retyping needed.
 * Neither screen is the loading screen, so requestClose() closes the modal
 * from either one immediately, same as any other non-loading screen.
 */
type Screen = 'manual' | 'auto' | 'auto-loading' | 'auto-confirm' | 'auto-not-found' | 'auto-error'

export function BulkGenerateModal({ subjectId, onClose, onGenerated }: BulkGenerateModalProps) {
  const [screen, setScreen] = useState<Screen>('manual')
  const [units, setUnits] = useState('')
  const [lessonsPerUnit, setLessonsPerUnit] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [curriculumName, setCurriculumName] = useState('')
  const [generatedLessons, setGeneratedLessons] = useState<GeneratedLesson[]>([])
  const [committing, setCommitting] = useState(false)
  const [notFoundMessage, setNotFoundMessage] = useState('')
  const [showStopConfirm, setShowStopConfirm] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

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
    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      const result = await generateAiCurriculum(curriculumName, controller.signal)
      if (result.status === 'found') {
        setGeneratedLessons(result.lessons)
        setScreen('auto-confirm')
      } else {
        setNotFoundMessage(result.message)
        setScreen('auto-not-found')
      }
    } catch {
      // Aborted via the stop-generation confirm (#219) or an unmount: the
      // modal is already closing, so there's no screen to fall back to.
      if (controller.signal.aborted) return
      setScreen('auto-error')
    } finally {
      abortControllerRef.current = null
    }
  }

  /**
   * Gate for closing the modal (x/backdrop) or clicking "Back" (#219): while
   * a generation is in flight (the loading screen), route through
   * StopGenerationDialog instead of closing directly. Every other screen
   * closes immediately, same as before.
   */
  function requestClose() {
    if (screen === 'auto-loading') {
      setShowStopConfirm(true)
      return
    }
    onClose()
  }

  function handleConfirmStop() {
    abortControllerRef.current?.abort()
    setShowStopConfirm(false)
    onClose()
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
    <>
      <div className="bulk-generate-modal__backdrop" onClick={requestClose}>
        <div
          className="bulk-generate-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Bulk Generate"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="bulk-generate-modal__header">
            <h2>{screen === 'manual' ? 'Bulk Generate' : 'Auto-generate Curriculum'}</h2>
            <button type="button" aria-label="Close" className="bulk-generate-modal__close" onClick={requestClose}>
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
              <button type="button" className="bulk-generate-modal__back" onClick={requestClose}>
                Back
              </button>
              <p>Generating curriculum… this can take up to a minute.</p>
            </div>
          )}
          {screen === 'auto-not-found' && (
            <div className="inline-add-card__form">
              <button type="button" className="bulk-generate-modal__back" onClick={() => setScreen('auto')}>
                Back
              </button>
              <p className="bulk-generate-modal__not-found">{notFoundMessage}</p>
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
                  Try again
                </button>
              </div>
            </div>
          )}
          {screen === 'auto-error' && (
            <div className="inline-add-card__form">
              <button type="button" className="bulk-generate-modal__back" onClick={() => setScreen('auto')}>
                Back
              </button>
              <p role="alert" className="bulk-generate-modal__error">
                Something went wrong while generating this curriculum. Please try again.
              </p>
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
                  Try again
                </button>
              </div>
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
      {showStopConfirm && (
        <StopGenerationDialog onConfirm={handleConfirmStop} onClose={() => setShowStopConfirm(false)} />
      )}
    </>
  )
}
