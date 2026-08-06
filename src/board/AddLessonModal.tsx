import { useState, type FormEvent } from 'react'
import type { LessonRow } from '../db/schema'
import { createLesson, getNextLessonPosition, getSuggestedNewLessonPosition } from '../db'
import './AddLessonModal.css'

interface AddLessonModalProps {
  subjectId: string
  lessons: LessonRow[]
  onClose: () => void
}

/**
 * Lesson creation as a modal, per #115/ADR-0008: a deliberate exception to
 * ADR-0003 (modals are for picking among existing items; creation forms use
 * inline-expanding cards) for this one component, since the unit-column
 * layout (#114) doesn't give AddLessonCard's old inline-expanding form an
 * obvious home. Fields, validation, and the next-position auto-suggest
 * (getNextLessonPosition/getSuggestedNewLessonPosition) are unchanged from
 * the inline form it replaces -- only the presentation moved. There's a
 * single instance of this modal for the whole page (one entry point), not
 * one per unit column.
 */
export function AddLessonModal({ subjectId, lessons, onClose }: AddLessonModalProps) {
  const suggestion = getSuggestedNewLessonPosition(lessons, subjectId)
  const [title, setTitle] = useState('')
  const [unit, setUnit] = useState(String(suggestion.unit))
  const [lessonInUnit, setLessonInUnit] = useState(String(suggestion.lesson_in_unit))
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = title.trim() !== '' && unit.trim() !== '' && lessonInUnit.trim() !== ''

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit || submitting) return

    const unitNum = Number(unit)
    const lessonInUnitNum = Number(lessonInUnit)
    const duplicate = lessons.some((lesson) => lesson.unit === unitNum && lesson.lesson_in_unit === lessonInUnitNum)
    if (duplicate) {
      setError(`Unit ${unitNum}, Lesson ${lessonInUnitNum} already exists.`)
      return
    }

    setSubmitting(true)
    await createLesson({
      subject_id: subjectId,
      unit: unitNum,
      lesson_in_unit: lessonInUnitNum,
      title: title.trim(),
      description: description.trim(),
    })
    setSubmitting(false)
    onClose()
  }

  return (
    <div className="add-lesson-modal__backdrop" onClick={onClose}>
      <div
        className="add-lesson-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add lesson"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="add-lesson-modal__header">
          <h2>Add lesson</h2>
          <button type="button" aria-label="Close" className="add-lesson-modal__close" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <form className="inline-add-card__form" onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="new-lesson-title">Title</label>
          <input
            id="new-lesson-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Fractions"
            autoFocus
          />
          <label htmlFor="new-lesson-unit">Unit</label>
          <input
            id="new-lesson-unit"
            type="number"
            value={unit}
            onChange={(event) => {
              const value = event.target.value
              setUnit(value)
              setError('')

              const unitNum = Number(value)
              if (value.trim() !== '' && Number.isFinite(unitNum)) {
                const nextSuggestion = getNextLessonPosition(lessons, subjectId, unitNum)
                setLessonInUnit(String(nextSuggestion.lesson_in_unit))
              }
            }}
          />
          <label htmlFor="new-lesson-lesson-in-unit">Lesson in unit</label>
          <input
            id="new-lesson-lesson-in-unit"
            type="number"
            value={lessonInUnit}
            onChange={(event) => {
              setLessonInUnit(event.target.value)
              setError('')
            }}
          />
          <label htmlFor="new-lesson-description">Description</label>
          <textarea
            id="new-lesson-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          {error !== '' && <p className="curriculum__add-card-error">{error}</p>}
          <div className="inline-add-card__actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={submitting || !canSubmit}>
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
