import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { ClassRow, ProgressRow, StudentRow, SubjectRow, LessonRow } from '../db/schema'
import {
  advanceProgress,
  bulkAdvanceProgress,
  createStudent,
  createSubject,
  deleteStudent,
  findNextLesson,
  jumpToLesson,
  positionOf,
  renameClass,
  renameStudent,
  saveClassTemplate,
  unAdvanceProgress,
  upsertProgressReview,
  upsertProgressStep,
  type BulkAdvanceEntry,
} from '../db'
import { useCarouselDrag } from './useCarouselDrag'
import { ProgressCell } from './ProgressCell'
import { InlineAddCard } from './InlineAddCard'
import { InlineRenameField } from './InlineRenameField'
import { ContextMenu } from './ContextMenu'
import { SubjectNameLabel } from './SubjectNameLabel'
import { SubjectReorder } from './SubjectReorder'
import { SubjectPickerModal } from './SubjectPickerModal'
import { LessonPickerModal } from './LessonPickerModal'
import { RemoveStudentDialog } from './RemoveStudentDialog'
import './ClassBoard.css'

const PANEL_GAP = 24

function progressKey(studentId: string, subjectId: string) {
  return `${studentId}:${subjectId}`
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={direction === 'left' ? 'M15 4 L7 12 L15 20' : 'M9 4 L17 12 L9 20'} />
    </svg>
  )
}

interface AddSubjectCardProps {
  classId: string
  position: number
}

/** Trailing/alone "+" card for adding a subject, per #58. Calls createSubject directly, consistent with ClassBoard already calling advanceProgress/upsertProgressReview directly rather than via callback props. */
function AddSubjectCard({ classId, position }: AddSubjectCardProps) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  return (
    <InlineAddCard addLabel="Add subject" className="class-board__add-card">
      {({ collapse }) => {
        async function handleSubmit(event: FormEvent) {
          event.preventDefault()
          const trimmed = name.trim()
          if (trimmed === '' || submitting) return
          setSubmitting(true)
          await createSubject({ class_id: classId, name: trimmed, position })
          setSubmitting(false)
          setName('')
          collapse()
        }

        return (
          <form className="inline-add-card__form" onSubmit={handleSubmit}>
            <label htmlFor="new-subject-name">Subject name</label>
            <input
              id="new-subject-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Math"
              autoFocus
            />
            <div className="inline-add-card__actions">
              <button
                type="button"
                onClick={() => {
                  setName('')
                  collapse()
                }}
              >
                Cancel
              </button>
              <button type="submit" disabled={submitting || name.trim() === ''}>
                Add
              </button>
            </div>
          </form>
        )
      }}
    </InlineAddCard>
  )
}

interface SaveClassTemplateFormProps {
  classId: string
  initialName: string
  onClose: () => void
}

/**
 * Inline-expanding name form for "Save Class Template" (#169), reachable
 * from the book-menu dropdown rather than a "+" card -- so it's a bespoke
 * form, not InlineAddCard (which expects to render its own "+" trigger),
 * but still an ADR-0003 inline data-entry form rather than a modal. Prefills
 * with the Class's current live name, freely editable; submitting calls
 * saveClassTemplate directly (same direct-db-call convention as
 * AddSubjectCard/AddStudentCard) and closes back down via onClose. Save-only
 * per ADR-0016 -- no load/apply affordance exists anywhere.
 */
function SaveClassTemplateForm({ classId, initialName, onClose }: SaveClassTemplateFormProps) {
  const [name, setName] = useState(initialName)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '' || submitting) return
    setSubmitting(true)
    await saveClassTemplate(classId, trimmed)
    setSubmitting(false)
    onClose()
  }

  return (
    <div className="class-board__save-template">
      <form className="inline-add-card__form" onSubmit={handleSubmit}>
        <label htmlFor="save-class-template-name">Template name</label>
        <input
          id="save-class-template-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
        <div className="inline-add-card__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={submitting || name.trim() === ''}>
            Save
          </button>
        </div>
      </form>
    </div>
  )
}

interface AddStudentCardProps {
  classId: string
  position: number
}

/** Trailing "+" card for adding a student to the roster, per #78. Mirrors AddSubjectCard exactly: calls createStudent directly, clears/collapses on success. */
function AddStudentCard({ classId, position }: AddStudentCardProps) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  return (
    <InlineAddCard addLabel="Add student" className="class-board__add-student-card">
      {({ collapse }) => {
        async function handleSubmit(event: FormEvent) {
          event.preventDefault()
          const trimmed = name.trim()
          if (trimmed === '' || submitting) return
          setSubmitting(true)
          await createStudent({ class_id: classId, name: trimmed, position })
          setSubmitting(false)
          setName('')
          collapse()
        }

        return (
          <form className="inline-add-card__form" onSubmit={handleSubmit}>
            <label htmlFor="new-student-name">Student name</label>
            <input
              id="new-student-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Emily"
              autoFocus
            />
            <div className="inline-add-card__actions">
              <button
                type="button"
                onClick={() => {
                  setName('')
                  collapse()
                }}
              >
                Cancel
              </button>
              <button type="submit" disabled={submitting || name.trim() === ''}>
                Add
              </button>
            </div>
          </form>
        )
      }}
    </InlineAddCard>
  )
}

interface StudentRosterRowProps {
  student: StudentRow
  reviewCount: number
  onRequestRemove: (student: StudentRow) => void
  onNavigate: (studentId: string) => void
}

/**
 * One roster row: avatar, name, review-flag count, and (per #78, ADR-0006) a
 * right-click menu offering "Remove student", now joined by "Rename
 * student" (#33) -> InlineRenameField, per ADR-0003. Owns its own menu
 * open/closed + edit-mode state independently, the same way each
 * ProgressCell scopes its own menu state -- the row only reports the
 * removal request up to ClassBoard, which owns the confirmation dialog;
 * renaming, being non-destructive, is handled entirely within the row.
 *
 * Per #108, left-clicking the row (outside inline-rename mode) reports a
 * navigate-to-Student-Summary request the same way. That click handler
 * lives on an inner wrapper around just the avatar/name/review-count --
 * not the outer div -- so it doesn't sit as an ancestor of the ContextMenu
 * markup rendered alongside it; a click on "Rename student"/"Remove
 * student" would otherwise bubble into it and fire navigation too.
 */
function StudentRosterRow({ student, reviewCount, onRequestRemove, onNavigate }: StudentRosterRowProps) {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [editing, setEditing] = useState(false)

  return (
    <div
      className="class-board__student"
      onContextMenu={(event) => {
        if (editing) return
        event.preventDefault()
        setMenuPosition({ x: event.clientX, y: event.clientY })
      }}
    >
      <div
        className="class-board__student-clickable"
        onClick={() => {
          if (editing) return
          onNavigate(student.id)
        }}
      >
        <span className="class-board__student-avatar">{student.name[0]}</span>
        <div>
          <div className="class-board__student-name">
            {editing ? (
              <InlineRenameField
                ariaLabel="Student name"
                initialValue={student.name}
                onSubmit={async (trimmed) => {
                  await renameStudent(student.id, trimmed)
                  setEditing(false)
                }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              student.name
            )}
          </div>
          {reviewCount > 0 && <div className="class-board__review-count">{reviewCount} flagged for review</div>}
        </div>
      </div>
      {menuPosition && (
        <ContextMenu
          x={menuPosition.x}
          y={menuPosition.y}
          onClose={() => setMenuPosition(null)}
          items={[
            {
              label: 'Rename student',
              onSelect: () => setEditing(true),
            },
            {
              label: 'Remove student',
              onSelect: () => onRequestRemove(student),
            },
          ]}
        />
      )}
    </div>
  )
}

/**
 * The class-board header's class-name heading -- right-click -> "Rename
 * class" -> InlineRenameField, per #33/ADR-0006/ADR-0003. Owns its own
 * menu/edit state, the same per-element pattern as StudentRosterRow and
 * ProgressCell. Used in both the zero-subjects empty state and the full
 * board header, so renaming works regardless of whether any subject exists
 * yet.
 */
function ClassNameHeading({ classRow }: { classRow: ClassRow }) {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [editing, setEditing] = useState(false)

  return (
    <>
      <h1
        onContextMenu={(event) => {
          if (editing) return
          event.preventDefault()
          setMenuPosition({ x: event.clientX, y: event.clientY })
        }}
      >
        {editing ? (
          <InlineRenameField
            ariaLabel="Class name"
            initialValue={classRow.name}
            onSubmit={async (trimmed) => {
              await renameClass(classRow.id, trimmed)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          classRow.name
        )}
      </h1>
      {menuPosition && (
        <ContextMenu
          x={menuPosition.x}
          y={menuPosition.y}
          onClose={() => setMenuPosition(null)}
          items={[{ label: 'Rename class', onSelect: () => setEditing(true) }]}
        />
      )}
    </>
  )
}

interface ClassBoardProps {
  classRow: ClassRow
  subjects: SubjectRow[]
  students: StudentRow[]
  progress: ProgressRow[]
  lessons: LessonRow[]
  activeSubjectId: string | undefined
  onSubjectChange: (subjectId: string) => void
  onCurriculumNavigate: (subjectId: string) => void
  onReportNavigate: () => void
  onStudentNavigate: (studentId: string) => void
}

/**
 * The validated Variant B subject-carousel board, folded in from the
 * prototype (prototype/22-class-board-variants) and reimplemented against
 * real Dexie data: students are a fixed vertical list, subjects are cards
 * spun through like a wheel, each holding every student's progress in that
 * one subject.
 */
export function ClassBoard({
  classRow,
  subjects,
  students,
  progress,
  lessons,
  activeSubjectId,
  onSubjectChange,
  onCurriculumNavigate,
  onReportNavigate,
  onStudentNavigate,
}: ClassBoardProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [panelWidth, setPanelWidth] = useState(520)
  const [containerWidth, setContainerWidth] = useState(0)
  const panelRefs = useRef(new Map<string, HTMLDivElement>())
  const panelRects = useRef(new Map<string, DOMRect>())
  const [bookMenuOpen, setBookMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [bulkUndo, setBulkUndo] = useState<{ subjectId: string; entries: BulkAdvanceEntry[] } | null>(null)
  const [jumpPickerRequest, setJumpPickerRequest] = useState<{ studentId: string; subjectId: string } | null>(
    null,
  )
  const [removeStudentRequest, setRemoveStudentRequest] = useState<StudentRow | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
      setPanelWidth(Math.min(575, entry.contentRect.width * 0.62))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const progressByKey = useMemo(() => {
    const map = new Map<string, ProgressRow>()
    for (const row of progress) {
      map.set(progressKey(row.student_id, row.subject_id), row)
    }
    return map
  }, [progress])

  const initialIndex = Math.max(
    0,
    subjects.findIndex((s) => s.id === activeSubjectId),
  )
  const step = panelWidth + PANEL_GAP
  const { index, offset, dragging, goTo, bind } = useCarouselDrag(step, subjects.length, initialIndex)

  const activeIndexSubjectId = subjects[index]?.id
  useEffect(() => {
    if (activeIndexSubjectId && activeIndexSubjectId !== activeSubjectId) {
      onSubjectChange(activeIndexSubjectId)
    }
    // Only fires when the carousel's own index moves to a different subject
    // than the URL currently reflects -- not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndexSubjectId])

  // Browser back/forward (or any external navigation) can change
  // activeSubjectId without the carousel having moved -- pull the wheel to
  // match. Deliberately keyed only on activeSubjectId/subjects, not index,
  // so it doesn't fight the effect above during a drag/dot-click.
  useEffect(() => {
    if (!activeSubjectId) return
    const matchIndex = subjects.findIndex((s) => s.id === activeSubjectId)
    if (matchIndex !== -1) {
      goTo(matchIndex)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubjectId, subjects])

  const subjectOrderKey = subjects.map((s) => s.id).join(',')
  // A saved reorder changes each panel's position via normal DOM/flex
  // reflow, which the browser doesn't animate on its own -- FLIP each panel
  // from where it was to where it now is so the swap reads as a slide
  // instead of a jump-cut, per #59.
  useLayoutEffect(() => {
    const prevRects = panelRects.current
    const nextRects = new Map<string, DOMRect>()
    panelRefs.current.forEach((el, id) => nextRects.set(id, el.getBoundingClientRect()))

    panelRefs.current.forEach((el, id) => {
      const prev = prevRects.get(id)
      const next = nextRects.get(id)
      if (!prev || !next) return
      const deltaX = prev.left - next.left
      if (deltaX === 0) return
      el.style.transition = 'none'
      el.style.transform = `translateX(${deltaX}px)`
      el.getBoundingClientRect()
      requestAnimationFrame(() => {
        el.style.transition = 'transform 300ms ease'
        el.style.transform = ''
      })
    })

    panelRects.current = nextRects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectOrderKey])

  async function handleAdvance(studentId: string, subjectId: string) {
    await advanceProgress(studentId, subjectId)
    if (bulkUndo?.subjectId === subjectId) {
      setBulkUndo(null)
    }
  }

  async function handleUnAdvance(studentId: string, subjectId: string) {
    await unAdvanceProgress(studentId, subjectId)
    if (bulkUndo?.subjectId === subjectId) {
      setBulkUndo(null)
    }
  }

  async function handleToggleReview(studentId: string, subjectId: string) {
    const current = progressByKey.get(progressKey(studentId, subjectId))
    await upsertProgressReview(studentId, subjectId, !current?.review)
    if (bulkUndo?.subjectId === subjectId) {
      setBulkUndo(null)
    }
  }

  async function handleBulkAdvance(subjectId: string) {
    const entries = await bulkAdvanceProgress(
      students.map((s) => s.id),
      subjectId,
    )
    setBulkUndo(entries.length > 0 ? { subjectId, entries } : null)
  }

  async function handleUndoBulkAdvance() {
    if (!bulkUndo) return
    const { subjectId, entries } = bulkUndo
    for (const entry of entries) {
      await upsertProgressStep(entry.studentId, subjectId, entry.previous)
    }
    setBulkUndo(null)
  }

  async function handleJumpToLesson(studentId: string, subjectId: string, lesson: LessonRow) {
    await jumpToLesson(studentId, subjectId, lesson)
    if (bulkUndo?.subjectId === subjectId) {
      setBulkUndo(null)
    }
    setJumpPickerRequest(null)
  }

  async function handleRemoveStudent(studentId: string) {
    await deleteStudent(studentId)
    setRemoveStudentRequest(null)
  }

  // Shared between the zero-subjects empty state and the full board, per
  // #78: a teacher can build their roster before adding any subject, so
  // setup order between students and subjects isn't forced.
  const studentsPanel = (
    <div className="class-board__students">
      {students.map((student) => {
        const reviewCount = subjects.filter(
          (subject) => progressByKey.get(progressKey(student.id, subject.id))?.review,
        ).length
        return (
          <StudentRosterRow
            key={student.id}
            student={student}
            reviewCount={reviewCount}
            onRequestRemove={setRemoveStudentRequest}
            onNavigate={onStudentNavigate}
          />
        )
      })}
      {students.length === 0 && <p className="class-board__empty-message">No students yet.</p>}
      <AddStudentCard classId={classRow.id} position={students.length} />
    </div>
  )

  const removeStudentDialog = removeStudentRequest && (
    <RemoveStudentDialog
      student={removeStudentRequest}
      onConfirm={() => void handleRemoveStudent(removeStudentRequest.id)}
      onClose={() => setRemoveStudentRequest(null)}
    />
  )

  if (subjects.length === 0) {
    return (
      <div className="class-board class-board--empty">
        <header className="class-board__header">
          <ClassNameHeading classRow={classRow} />
        </header>
        <div className="class-board__empty-body">
          {studentsPanel}
          <AddSubjectCard classId={classRow.id} position={0} />
        </div>
        {removeStudentDialog}
      </div>
    )
  }

  return (
    <div className="class-board">
      <header className="class-board__header">
        <div className="class-board__header-row">
          <ClassNameHeading classRow={classRow} />
          <div className="class-board__book">
            <button
              type="button"
              aria-label="Add lessons menu"
              className="class-board__book-button"
              onClick={() => setBookMenuOpen((open) => !open)}
            >
              <span aria-hidden="true">📖</span>
            </button>
            {bookMenuOpen && (
              <div className="class-board__book-menu">
                <button
                  type="button"
                  className="class-board__book-menu-item"
                  onClick={() => {
                    setBookMenuOpen(false)
                    setPickerOpen(true)
                  }}
                >
                  Curriculum Page
                </button>
                <button
                  type="button"
                  className="class-board__book-menu-item"
                  onClick={() => {
                    setBookMenuOpen(false)
                    onReportNavigate()
                  }}
                >
                  Generate report
                </button>
                <button
                  type="button"
                  className="class-board__book-menu-item"
                  onClick={() => {
                    setBookMenuOpen(false)
                    setSavingTemplate(true)
                  }}
                >
                  Save Class Template
                </button>
              </div>
            )}
          </div>
        </div>
        {savingTemplate && (
          <SaveClassTemplateForm
            classId={classRow.id}
            initialName={classRow.name}
            onClose={() => setSavingTemplate(false)}
          />
        )}
        <p>Drag the subject cards left or right to spin through the wheel.</p>
      </header>
      {pickerOpen && (
        <SubjectPickerModal
          subjects={subjects}
          onSelectSubject={(subjectId) => {
            setPickerOpen(false)
            onCurriculumNavigate(subjectId)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {jumpPickerRequest &&
        (() => {
          const student = students.find((s) => s.id === jumpPickerRequest.studentId)
          const subject = subjects.find((s) => s.id === jumpPickerRequest.subjectId)
          if (!student || !subject) return null
          const subjectLessons = lessons.filter((l) => l.subject_id === subject.id)
          const studentProgress = progressByKey.get(progressKey(student.id, subject.id))
          return (
            <LessonPickerModal
              studentName={student.name}
              lessons={subjectLessons}
              currentPosition={positionOf(studentProgress)}
              onSelectLesson={(lesson) => void handleJumpToLesson(student.id, subject.id, lesson)}
              onClose={() => setJumpPickerRequest(null)}
            />
          )
        })()}
      {removeStudentDialog}
      <div className="class-board__body">
        {studentsPanel}

        <div ref={wrapRef} className="class-board__carousel-wrap">
          {index > 0 && (
            <button
              type="button"
              aria-label="Previous subject"
              className="class-board__carousel-arrow class-board__carousel-arrow--prev"
              onClick={() => goTo(index - 1)}
            >
              <ChevronIcon direction="left" />
            </button>
          )}
          <div
            {...bind}
            className={`class-board__carousel${dragging ? ' class-board__carousel--dragging' : ''}`}
            style={{
              transform: `translateX(${containerWidth / 2 - panelWidth / 2 + offset}px)`,
              transition: dragging ? 'none' : undefined,
            }}
          >
            {subjects.map((subject, i) => {
              const subjectLessons = lessons.filter((l) => l.subject_id === subject.id)
              return (
                <div
                  key={subject.id}
                  ref={(el) => {
                    if (el) panelRefs.current.set(subject.id, el)
                    else panelRefs.current.delete(subject.id)
                  }}
                  className="class-board__panel"
                  style={{ width: panelWidth, marginRight: PANEL_GAP, opacity: i === index ? 1 : 0.45 }}
                >
                  <div className="class-board__panel-header">
                    <SubjectNameLabel subject={subject} />
                    {i === index && (
                      <div className="class-board__bulk-advance-group">
                        <button
                          type="button"
                          className="class-board__bulk-advance"
                          onClick={() => void handleBulkAdvance(subject.id)}
                          disabled={subjectLessons.length === 0 || students.length === 0}
                        >
                          Bulk Advance
                        </button>
                        {bulkUndo?.subjectId === subject.id && (
                          <button
                            type="button"
                            className="class-board__bulk-advance-undo"
                            onClick={() => void handleUndoBulkAdvance()}
                          >
                            Undo
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="class-board__panel-body">
                    {subjectLessons.length === 0 ? (
                      <div className="class-board__panel-empty">
                        <p>This Subject is empty.</p>
                        <button
                          type="button"
                          className="class-board__panel-empty-link"
                          onClick={() => onCurriculumNavigate(subject.id)}
                        >
                          + Add lessons
                        </button>
                      </div>
                    ) : (
                      students.map((student) => {
                        const studentProgress = progressByKey.get(progressKey(student.id, subject.id))
                        const nextLesson = findNextLesson(subjectLessons, subject.id, positionOf(studentProgress))
                        return (
                          <ProgressCell
                            key={student.id}
                            studentName={student.name}
                            progress={studentProgress}
                            hasNextLesson={nextLesson !== undefined}
                            hasAnyLessons={subjectLessons.length > 0}
                            subjectLessons={subjectLessons}
                            onAdvance={() => void handleAdvance(student.id, subject.id)}
                            onToggleReview={() => void handleToggleReview(student.id, subject.id)}
                            onJumpToLesson={() =>
                              setJumpPickerRequest({ studentId: student.id, subjectId: subject.id })
                            }
                            onUnAdvance={() => void handleUnAdvance(student.id, subject.id)}
                          />
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
            <div className="class-board__add-card-slot" style={{ marginRight: PANEL_GAP }}>
              <AddSubjectCard classId={classRow.id} position={subjects.length} />
            </div>
          </div>
          {index < subjects.length - 1 && (
            <button
              type="button"
              aria-label="Next subject"
              className="class-board__carousel-arrow class-board__carousel-arrow--next"
              onClick={() => goTo(index + 1)}
            >
              <ChevronIcon direction="right" />
            </button>
          )}

          <SubjectReorder subjects={subjects} activeIndex={index} onDotClick={goTo} />
        </div>
      </div>
    </div>
  )
}
