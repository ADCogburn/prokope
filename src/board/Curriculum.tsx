import { useState, type FormEvent } from 'react'
import type { ClassRow, LessonRow, SubjectRow } from '../db/schema'
import { createLesson, deleteLesson, getNextLessonPosition } from '../db'
import { InlineAddCard } from './InlineAddCard'
import './Curriculum.css'

interface AddLessonCardProps {
  subjectId: string
  lessons: LessonRow[]
}

/** Trailing/alone "+" card for adding a lesson, per #60. Reuses InlineAddCard from #58; validates the (unit, lesson_in_unit) pair against the already-loaded lesson list before calling createLesson, rather than relying on the underlying Dexie constraint to fail the write. */
function AddLessonCard({ subjectId, lessons }: AddLessonCardProps) {
  const [title, setTitle] = useState('')
  const [unit, setUnit] = useState('')
  const [lessonInUnit, setLessonInUnit] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = title.trim() !== '' && unit.trim() !== '' && lessonInUnit.trim() !== ''

  return (
    <InlineAddCard addLabel="Add lesson" className="curriculum__add-card">
      {({ collapse }) => {
        function reset() {
          setTitle('')
          setUnit('')
          setLessonInUnit('')
          setDescription('')
          setError('')
        }

        async function handleSubmit(event: FormEvent) {
          event.preventDefault()
          if (!canSubmit || submitting) return

          const unitNum = Number(unit)
          const lessonInUnitNum = Number(lessonInUnit)
          const duplicate = lessons.some(
            (lesson) => lesson.unit === unitNum && lesson.lesson_in_unit === lessonInUnitNum,
          )
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
          reset()
          collapse()
        }

        return (
          <form className="inline-add-card__form" onSubmit={handleSubmit}>
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
                  const suggestion = getNextLessonPosition(lessons, subjectId, unitNum)
                  setLessonInUnit(String(suggestion.lesson_in_unit))
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
              <button
                type="button"
                onClick={() => {
                  reset()
                  collapse()
                }}
              >
                Cancel
              </button>
              <button type="submit" disabled={submitting || !canSubmit}>
                Add
              </button>
            </div>
          </form>
        )
      }}
    </InlineAddCard>
  )
}

interface CurriculumProps {
  classRow: ClassRow
  subject: SubjectRow
  lessons: LessonRow[]
  onBack: () => void
}

/**
 * Per-subject curriculum authoring view, per #56/#60: a dedicated route
 * (rather than the board panel) for defining a subject's lesson list,
 * reached from that subject's empty-lessons board panel. Lessons are shown
 * in unit/lesson_in_unit order; `lessons` is expected pre-filtered to this
 * subject and pre-sorted (mirrors ClassBoard's data-down pattern).
 */
export function Curriculum({ classRow, subject, lessons, onBack }: CurriculumProps) {
  return (
    <div className="curriculum">
      <header className="curriculum__header">
        <button type="button" className="curriculum__back" onClick={onBack}>
          ← Back to board
        </button>
        <h1>{subject.name}</h1>
        <p>{classRow.name}</p>
      </header>
      <div className="curriculum__body">
        {lessons.length === 0 ? (
          <AddLessonCard subjectId={subject.id} lessons={lessons} />
        ) : (
          <>
            <ul className="curriculum__lesson-list">
              {lessons.map((lesson) => (
                <li key={lesson.id} className="curriculum__lesson">
                  <div className="curriculum__lesson-main">
                    <span className="curriculum__lesson-position">
                      Unit {lesson.unit} · Lesson {lesson.lesson_in_unit}
                    </span>
                    <span className="curriculum__lesson-title">{lesson.title}</span>
                    {lesson.description !== '' && (
                      <p className="curriculum__lesson-description">{lesson.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="curriculum__lesson-delete"
                    aria-label={`Delete ${lesson.title}`}
                    onClick={() => {
                      if (window.confirm(`Delete "${lesson.title}"?`)) {
                        void deleteLesson(lesson.id)
                      }
                    }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
            <AddLessonCard subjectId={subject.id} lessons={lessons} />
          </>
        )}
      </div>
    </div>
  )
}
