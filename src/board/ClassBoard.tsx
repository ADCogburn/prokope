import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { ClassRow, ProgressRow, StudentRow, SubjectRow, LessonRow } from '../db/schema'
import { advanceProgress, createSubject, findNextLesson, positionOf, upsertProgressReview } from '../db'
import { useCarouselDrag } from './useCarouselDrag'
import { ProgressCell } from './ProgressCell'
import { InlineAddCard } from './InlineAddCard'
import './ClassBoard.css'

const PANEL_GAP = 24

function progressKey(studentId: string, subjectId: string) {
  return `${studentId}:${subjectId}`
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

interface ClassBoardProps {
  classRow: ClassRow
  subjects: SubjectRow[]
  students: StudentRow[]
  progress: ProgressRow[]
  lessons: LessonRow[]
  activeSubjectId: string | undefined
  onSubjectChange: (subjectId: string) => void
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
}: ClassBoardProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [panelWidth, setPanelWidth] = useState(420)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
      setPanelWidth(Math.min(460, entry.contentRect.width * 0.62))
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

  async function handleAdvance(studentId: string, subjectId: string) {
    await advanceProgress(studentId, subjectId)
  }

  async function handleToggleReview(studentId: string, subjectId: string) {
    const current = progressByKey.get(progressKey(studentId, subjectId))
    await upsertProgressReview(studentId, subjectId, !current?.review)
  }

  if (subjects.length === 0) {
    return (
      <div className="class-board class-board--empty">
        <header className="class-board__header">
          <h1>{classRow.name}</h1>
        </header>
        <AddSubjectCard classId={classRow.id} position={0} />
      </div>
    )
  }

  return (
    <div className="class-board">
      <header className="class-board__header">
        <h1>{classRow.name}</h1>
        <p>Drag the subject cards left or right to spin through the wheel.</p>
      </header>
      <div className="class-board__body">
        <div className="class-board__students">
          {students.map((student) => {
            const reviewCount = subjects.filter(
              (subject) => progressByKey.get(progressKey(student.id, subject.id))?.review,
            ).length
            return (
              <div key={student.id} className="class-board__student">
                <span className="class-board__student-avatar">{student.name[0]}</span>
                <div>
                  <div className="class-board__student-name">{student.name}</div>
                  {reviewCount > 0 && (
                    <div className="class-board__review-count">{reviewCount} flagged for review</div>
                  )}
                </div>
              </div>
            )
          })}
          {students.length === 0 && <p className="class-board__empty-message">No students yet.</p>}
        </div>

        <div ref={wrapRef} className="class-board__carousel-wrap">
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
                  className="class-board__panel"
                  style={{ width: panelWidth, marginRight: PANEL_GAP, opacity: i === index ? 1 : 0.45 }}
                >
                  <div className="class-board__panel-header">{subject.name}</div>
                  <div className="class-board__panel-body">
                    {students.map((student) => {
                      const studentProgress = progressByKey.get(progressKey(student.id, subject.id))
                      const nextLesson = findNextLesson(subjectLessons, subject.id, positionOf(studentProgress))
                      return (
                        <ProgressCell
                          key={student.id}
                          studentName={student.name}
                          progress={studentProgress}
                          hasNextLesson={nextLesson !== undefined}
                          hasAnyLessons={subjectLessons.length > 0}
                          onAdvance={() => void handleAdvance(student.id, subject.id)}
                          onToggleReview={() => void handleToggleReview(student.id, subject.id)}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
            <div className="class-board__add-card-slot" style={{ marginRight: PANEL_GAP }}>
              <AddSubjectCard classId={classRow.id} position={subjects.length} />
            </div>
          </div>

          <div className="class-board__dots">
            {subjects.map((subject, i) => (
              <button
                key={subject.id}
                type="button"
                aria-label={`Go to ${subject.name}`}
                onClick={() => goTo(i)}
                className={`class-board__dot${i === index ? ' class-board__dot--active' : ''}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
