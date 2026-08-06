import { useState, type FormEvent } from 'react'
import type { ClassRow, LessonRow, SubjectRow } from '../db/schema'
import {
  createLesson,
  deleteLesson,
  getNextLessonPosition,
  getSuggestedNewLessonPosition,
  updateLessonContent,
} from '../db'
import { InlineAddCard } from './InlineAddCard'
import { ContextMenu } from './ContextMenu'
import { SubjectNameLabel } from './SubjectNameLabel'
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
    <InlineAddCard
      addLabel="Add lesson"
      className="curriculum__add-card"
      onExpand={() => {
        const suggestion = getSuggestedNewLessonPosition(lessons, subjectId)
        setUnit(String(suggestion.unit))
        setLessonInUnit(String(suggestion.lesson_in_unit))
      }}
    >
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

interface LessonListItemProps {
  lesson: LessonRow
  lessons: LessonRow[]
}

/**
 * One lesson row: position, title, description, the existing Delete
 * control (#74), a visible Edit control, and (per #33, ADR-0006) a
 * right-click menu offering the same "Edit lesson" action. Editing swaps the
 * row for an inline unit/lesson-number/title/description form -- mirroring
 * AddLessonCard's own form markup/classes rather than a modal, per ADR-0003
 * -- since four fields don't fit InlineRenameField's single-input swap.
 * Per #103, unit/lesson_in_unit are editable here too (widened from #33's
 * title/description-only scope): a save that would collide with another
 * lesson already at that (unit, lesson_in_unit) in the subject is rejected
 * with an inline error, mirroring AddLessonCard's own duplicate-position
 * check but excluding this lesson itself. Owns its own menu-open + edit-mode
 * state, the same per-row pattern as ProgressCell/StudentRosterRow.
 */
function LessonListItem({ lesson, lessons }: LessonListItemProps) {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const [unit, setUnit] = useState(String(lesson.unit))
  const [lessonInUnit, setLessonInUnit] = useState(String(lesson.lesson_in_unit))
  const [title, setTitle] = useState(lesson.title)
  const [description, setDescription] = useState(lesson.description)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function startEditing() {
    setUnit(String(lesson.unit))
    setLessonInUnit(String(lesson.lesson_in_unit))
    setTitle(lesson.title)
    setDescription(lesson.description)
    setError('')
    setEditing(true)
  }

  function cancelEditing() {
    setUnit(String(lesson.unit))
    setLessonInUnit(String(lesson.lesson_in_unit))
    setTitle(lesson.title)
    setDescription(lesson.description)
    setError('')
    setEditing(false)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmedTitle = title.trim()
    if (trimmedTitle === '' || submitting) return

    const unitNum = Number(unit)
    const lessonInUnitNum = Number(lessonInUnit)
    const duplicate = lessons.some(
      (other) => other.id !== lesson.id && other.unit === unitNum && other.lesson_in_unit === lessonInUnitNum,
    )
    if (duplicate) {
      setError(`Unit ${unitNum}, Lesson ${lessonInUnitNum} already exists.`)
      return
    }

    setSubmitting(true)
    await updateLessonContent(lesson.id, {
      unit: unitNum,
      lesson_in_unit: lessonInUnitNum,
      title: trimmedTitle,
      description: description.trim(),
    })
    setSubmitting(false)
    setEditing(false)
  }

  const canSubmit = title.trim() !== '' && unit.trim() !== '' && lessonInUnit.trim() !== ''

  if (editing) {
    return (
      <li className="curriculum__lesson curriculum__lesson--editing">
        <form className="inline-add-card__form" onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor={`edit-lesson-unit-${lesson.id}`}>Unit</label>
          <input
            id={`edit-lesson-unit-${lesson.id}`}
            type="number"
            value={unit}
            onChange={(event) => {
              setUnit(event.target.value)
              setError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancelEditing()
            }}
            autoFocus
          />
          <label htmlFor={`edit-lesson-lesson-in-unit-${lesson.id}`}>Lesson in unit</label>
          <input
            id={`edit-lesson-lesson-in-unit-${lesson.id}`}
            type="number"
            value={lessonInUnit}
            onChange={(event) => {
              setLessonInUnit(event.target.value)
              setError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancelEditing()
            }}
          />
          <label htmlFor={`edit-lesson-title-${lesson.id}`}>Title</label>
          <input
            id={`edit-lesson-title-${lesson.id}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancelEditing()
            }}
          />
          <label htmlFor={`edit-lesson-description-${lesson.id}`}>Description</label>
          <textarea
            id={`edit-lesson-description-${lesson.id}`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancelEditing()
            }}
          />
          {error !== '' && <p className="curriculum__add-card-error">{error}</p>}
          <div className="inline-add-card__actions">
            <button type="button" onClick={cancelEditing}>
              Cancel
            </button>
            <button type="submit" disabled={submitting || !canSubmit}>
              Save
            </button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li
      className="curriculum__lesson"
      onContextMenu={(event) => {
        event.preventDefault()
        setMenuPosition({ x: event.clientX, y: event.clientY })
      }}
    >
      <div className="curriculum__lesson-main">
        <span className="curriculum__lesson-position">
          Unit {lesson.unit} · Lesson {lesson.lesson_in_unit}
        </span>
        <span className="curriculum__lesson-title">{lesson.title}</span>
        {lesson.description !== '' && <p className="curriculum__lesson-description">{lesson.description}</p>}
      </div>
      <div className="curriculum__lesson-actions">
        <button
          type="button"
          className="curriculum__lesson-edit"
          aria-label={`Edit ${lesson.title}`}
          onClick={startEditing}
        >
          Edit
        </button>
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
      </div>
      {menuPosition && (
        <ContextMenu
          x={menuPosition.x}
          y={menuPosition.y}
          onClose={() => setMenuPosition(null)}
          items={[{ label: 'Edit lesson', onSelect: startEditing }]}
        />
      )}
    </li>
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
        <SubjectNameLabel subject={subject} tag="h1" showPencil />
        <p>{classRow.name}</p>
      </header>
      <div className="curriculum__body">
        {lessons.length === 0 ? (
          <AddLessonCard subjectId={subject.id} lessons={lessons} />
        ) : (
          <>
            <ul className="curriculum__lesson-list">
              {lessons.map((lesson) => (
                <LessonListItem key={lesson.id} lesson={lesson} lessons={lessons} />
              ))}
            </ul>
            <AddLessonCard subjectId={subject.id} lessons={lessons} />
          </>
        )}
      </div>
    </div>
  )
}
