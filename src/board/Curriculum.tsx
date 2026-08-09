import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ClassRow, LessonRow, SubjectRow } from '../db/schema'
import { deleteLesson, deleteSubject, saveSubjectTemplate, updateLessonContent } from '../db'
import { ContextMenu } from './ContextMenu'
import { SubjectNameLabel } from './SubjectNameLabel'
import { AddLessonModal } from './AddLessonModal'
import { BulkGenerateModal } from './BulkGenerateModal'
import { RemoveLessonDialog } from './RemoveLessonDialog'
import { RemoveSubjectDialog } from './RemoveSubjectDialog'
import { InlineAddCard } from './InlineAddCard'
import { groupLessonsByUnit } from './groupLessonsByUnit'
import { useUnitWindow } from './useUnitWindow'
import { countVisibleUnitColumns } from './countVisibleUnitColumns'
import './InlineAddCard.css'
import './Curriculum.css'

const UNIT_COLUMN_WIDTH = 280
const UNIT_COLUMN_GAP = 16

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={direction === 'left' ? 'M15 4 L7 12 L15 20' : 'M9 4 L17 12 L9 20'} />
    </svg>
  )
}

interface LessonListItemProps {
  lesson: LessonRow
  lessons: LessonRow[]
  onLessonMutated: () => void
}

/**
 * One lesson row: position, title, description, a Remove control (#74,
 * confirmed via RemoveLessonDialog per #136 rather than a native confirm()
 * popup), a visible Edit control, and (per #33, ADR-0006) a right-click menu
 * offering the same "Edit lesson" action. Editing swaps the
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
function LessonListItem({ lesson, lessons, onLessonMutated }: LessonListItemProps) {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const [unit, setUnit] = useState(String(lesson.unit))
  const [lessonInUnit, setLessonInUnit] = useState(String(lesson.lesson_in_unit))
  const [title, setTitle] = useState(lesson.title)
  const [description, setDescription] = useState(lesson.description)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [removeRequested, setRemoveRequested] = useState(false)

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
    onLessonMutated()
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
        <span className="curriculum__lesson-position">Lesson {lesson.lesson_in_unit}</span>
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
          className="curriculum__lesson-remove"
          aria-label={`Remove ${lesson.title}`}
          onClick={() => setRemoveRequested(true)}
        >
          Remove
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
      {removeRequested && (
        <RemoveLessonDialog
          lesson={lesson}
          onConfirm={() => {
            void deleteLesson(lesson.id)
            setRemoveRequested(false)
            onLessonMutated()
          }}
          onClose={() => setRemoveRequested(false)}
        />
      )}
    </li>
  )
}

interface UnitColumnProps {
  unit: number
  unitLessons: LessonRow[]
  allLessons: LessonRow[]
  onLessonMutated: () => void
}

/** One unit's lessons as their own column, per #114/#106: the column header carries "Unit N" so each row inside only needs its own lesson label. */
function UnitColumn({ unit, unitLessons, allLessons, onLessonMutated }: UnitColumnProps) {
  return (
    <div className="curriculum__unit-column">
      <h2 className="curriculum__unit-header">Unit {unit}</h2>
      <ul className="curriculum__lesson-list">
        {unitLessons.map((lesson) => (
          <LessonListItem key={lesson.id} lesson={lesson} lessons={allLessons} onLessonMutated={onLessonMutated} />
        ))}
      </ul>
    </div>
  )
}

interface SaveSubjectTemplateCardProps {
  subjectId: string
  subjectName: string
}

/**
 * Inline-expanding "Save as Template" affordance, per #166/ADR-0003: lets a
 * teacher checkpoint the Subject's current live Lessons into a reusable
 * Subject Template (saveSubjectTemplate, #165) at any time, without
 * touching the live Subject or its Lessons. Mirrors ClassBoard's
 * AddSubjectCard exactly -- same InlineAddCard usage, Cancel/submit
 * shape -- except the name field starts pre-filled with the Subject's
 * current name (still freely editable) rather than blank, since a Template
 * is commonly saved under a more specific label (e.g. "... - Fall
 * Semester") than the live Subject's own name.
 */
function SaveSubjectTemplateCard({ subjectId, subjectName }: SaveSubjectTemplateCardProps) {
  const [name, setName] = useState(subjectName)
  const [submitting, setSubmitting] = useState(false)

  return (
    <InlineAddCard addLabel="Save as Template" className="curriculum__save-template-card">
      {({ collapse }) => {
        async function handleSubmit(event: FormEvent) {
          event.preventDefault()
          const trimmed = name.trim()
          if (trimmed === '' || submitting) return
          setSubmitting(true)
          await saveSubjectTemplate(subjectId, trimmed)
          setSubmitting(false)
          setName(subjectName)
          collapse()
        }

        return (
          <form className="inline-add-card__form" onSubmit={handleSubmit}>
            <label htmlFor="save-template-name">Template name</label>
            <input
              id="save-template-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
            <div className="inline-add-card__actions">
              <button
                type="button"
                onClick={() => {
                  setName(subjectName)
                  collapse()
                }}
              >
                Cancel
              </button>
              <button type="submit" disabled={submitting || name.trim() === ''}>
                Save
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
 *
 * Per #114/#106: lessons render as one column per unit (groupLessonsByUnit,
 * #109) rather than one flat list. The number of unit columns visible at
 * once is however many fit the measured wrap width (countVisibleUnitColumns,
 * #109) -- the same responsive-width-measurement approach ClassBoard already
 * uses for its Subject-card sizing. useUnitWindow (#109) tracks which
 * contiguous slice of units is in view and exposes prev/next to slide that
 * window one unit at a time; the arrows themselves are only rendered when
 * there's somewhere left to go in that direction.
 */
export function Curriculum({ classRow, subject, lessons, onBack }: CurriculumProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const [addLessonModalOpen, setAddLessonModalOpen] = useState(false)
  const [bulkGenerateModalOpen, setBulkGenerateModalOpen] = useState(false)
  // Per #164: the ids created by the most recent Bulk Generate run for this
  // subject, so a one-shot "Undo Bulk Generation" control can appear. Plain
  // component-local state (no persistence) -- a fresh mount (navigate away
  // and back) or an unmount naturally has no memory of it. Single-slot, not
  // a stack: any other lesson-affecting action on the page (add/edit/remove,
  // or running Bulk Generate again) clears/replaces it, mirroring
  // ClassBoard's bulkUndo pattern for Bulk Advance (ADR-0005).
  const [lastBulkGenerateIds, setLastBulkGenerateIds] = useState<string[] | null>(null)
  // #194: "child reports up, parent owns the dialog" -- same pattern as
  // ClassBoard's removeSubjectRequest (#193). Once confirmed, deleteSubject
  // soft-deletes this Subject and CurriculumRoute's existing reactive
  // redirect (subjectId no longer matches a live Subject) sends the teacher
  // back to the Class Board; no navigation call is needed here.
  const [removeSubjectRequested, setRemoveSubjectRequested] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const unitGroups = groupLessonsByUnit(lessons)
  // Before the wrap has actually been measured, show every unit rather than
  // guessing a width and potentially hiding lessons that do fit.
  const visibleCount =
    containerWidth === null ? unitGroups.length : countVisibleUnitColumns(containerWidth, UNIT_COLUMN_WIDTH + UNIT_COLUMN_GAP)
  const { startIndex, endIndex, canGoPrev, canGoNext, next, prev } = useUnitWindow(unitGroups.length, visibleCount)
  const visibleUnitGroups = unitGroups.slice(startIndex, endIndex)

  async function handleUndoBulkGenerate() {
    if (!lastBulkGenerateIds) return
    for (const id of lastBulkGenerateIds) {
      await deleteLesson(id)
    }
    setLastBulkGenerateIds(null)
  }

  async function handleRemoveSubject() {
    await deleteSubject(subject.id)
    setRemoveSubjectRequested(false)
  }

  return (
    <div className="curriculum">
      <header className="curriculum__header">
        <div className="curriculum__header-main">
          <button type="button" className="curriculum__back" onClick={onBack}>
            ← Back to board
          </button>
          <div className="curriculum__title-row">
            <SubjectNameLabel
              subject={subject}
              tag="h1"
              showPencil
              onRequestRemove={() => setRemoveSubjectRequested(true)}
            />
            <div className="curriculum__header-actions">
              <button
                type="button"
                className="inline-add-card curriculum__header-add"
                onClick={() => setAddLessonModalOpen(true)}
              >
                + Add lesson
              </button>
              <button
                type="button"
                className="inline-add-card curriculum__header-add"
                onClick={() => setBulkGenerateModalOpen(true)}
              >
                Bulk Generate
              </button>
              {lastBulkGenerateIds !== null && lastBulkGenerateIds.length > 0 && (
                <button
                  type="button"
                  className="curriculum__bulk-generate-undo"
                  onClick={() => void handleUndoBulkGenerate()}
                >
                  Undo Bulk Generation
                </button>
              )}
            </div>
          </div>
          <p>{classRow.name}</p>
        </div>
        <SaveSubjectTemplateCard subjectId={subject.id} subjectName={subject.name} />
      </header>
      <div className="curriculum__body">
        {lessons.length > 0 && (
          <div className="curriculum__units-wrap" ref={wrapRef}>
            {canGoPrev && (
              <button
                type="button"
                aria-label="Previous unit"
                className="curriculum__unit-arrow curriculum__unit-arrow--prev"
                onClick={prev}
              >
                <ChevronIcon direction="left" />
              </button>
            )}
            <div className="curriculum__units">
              {visibleUnitGroups.map((group) => (
                <UnitColumn
                  key={group.unit}
                  unit={group.unit}
                  unitLessons={group.lessons}
                  allLessons={lessons}
                  onLessonMutated={() => setLastBulkGenerateIds(null)}
                />
              ))}
            </div>
            {canGoNext && (
              <button
                type="button"
                aria-label="Next unit"
                className="curriculum__unit-arrow curriculum__unit-arrow--next"
                onClick={next}
              >
                <ChevronIcon direction="right" />
              </button>
            )}
          </div>
        )}
      </div>
      {addLessonModalOpen && (
        <AddLessonModal
          subjectId={subject.id}
          lessons={lessons}
          onClose={() => {
            setAddLessonModalOpen(false)
            setLastBulkGenerateIds(null)
          }}
        />
      )}
      {bulkGenerateModalOpen && (
        <BulkGenerateModal
          subjectId={subject.id}
          onClose={() => setBulkGenerateModalOpen(false)}
          onGenerated={(ids) => setLastBulkGenerateIds(ids.length > 0 ? ids : null)}
        />
      )}
      {removeSubjectRequested && (
        <RemoveSubjectDialog
          subject={subject}
          onConfirm={() => void handleRemoveSubject()}
          onClose={() => setRemoveSubjectRequested(false)}
        />
      )}
    </div>
  )
}
