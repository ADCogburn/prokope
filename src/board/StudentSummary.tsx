import { useState } from 'react'
import type { ClassRow, LessonRow, ProgressRow, ReviewFlagRow, StudentRow, SubjectRow } from '../db/schema'
import { upsertReviewFlag } from '../db'
import { buildStudentSummary } from './studentSummaryData'
import './StudentSummary.css'

interface StudentSummaryProps {
  classRow: ClassRow
  student: StudentRow
  subjects: SubjectRow[]
  lessons: LessonRow[]
  progress: ProgressRow[]
  reviewFlags: ReviewFlagRow[]
  onBack: () => void
}

/**
 * The Student Summary page, per #107: a read-only, per-student overview of
 * current standing across every subject in the class, reached at
 * `/class/:classId/student/:studentId`. See the "Student Summary" glossary
 * entry in CONTEXT.md and ADR-0009 for why this has its own data builder
 * (buildStudentSummary) rather than reusing the printable report's.
 *
 * Per #154, this also renders each subject's flagged-lesson list with a
 * removal control, plus a page-visit-scoped "Undo review flag changes"
 * button. `removedLessonIds` is deliberately plain useState, not persisted
 * anywhere -- it tracks every lesson unflagged during this visit so Undo can
 * restore all of them in one click, and it naturally resets whenever this
 * component unmounts (i.e. the teacher navigates away from Student
 * Summary), which is the whole of the "disappears on navigation" rule. This
 * is its own pattern, distinct from Class Board's Bulk Advance undo (which
 * is cleared early by other progress-mutating actions) -- Student Summary
 * has no such competing actions, so page-visit-scoped is the entire rule.
 * `reviewFlags` (and therefore the rendered list) updates live because the
 * caller feeds it from a Dexie live query -- removing a flag here just
 * writes the ReviewFlag row and lets that query re-fire.
 */
export function StudentSummary({
  classRow,
  student,
  subjects,
  lessons,
  progress,
  reviewFlags,
  onBack,
}: StudentSummaryProps) {
  const [removedLessonIds, setRemovedLessonIds] = useState<string[]>([])

  const summary = buildStudentSummary(student, subjects, lessons, progress, reviewFlags)

  async function handleRemoveFlag(lessonId: string) {
    await upsertReviewFlag(student.id, lessonId, false)
    setRemovedLessonIds((prev) => (prev.includes(lessonId) ? prev : [...prev, lessonId]))
  }

  async function handleUndo() {
    for (const lessonId of removedLessonIds) {
      await upsertReviewFlag(student.id, lessonId, true)
    }
    setRemovedLessonIds([])
  }

  return (
    <div className="student-summary">
      <header className="student-summary__header">
        <div className="student-summary__header-main">
          <button type="button" className="student-summary__back" onClick={onBack}>
            ← Back
          </button>
          <div className="student-summary__identity">
            <span className="student-summary__avatar">{student.name[0]}</span>
            <div>
              <h1>{student.name}</h1>
              <p>{classRow.name}</p>
            </div>
          </div>
        </div>
        {removedLessonIds.length > 0 && (
          <button type="button" className="student-summary__undo" onClick={() => void handleUndo()}>
            Undo review flag changes
          </button>
        )}
      </header>
      <ul className="student-summary__subject-list">
        {summary.subjectRows.map(({ subject, lessonLabel, hasLessons, flaggedLessons }) => (
          <li
            key={subject.id}
            className={`student-summary__subject-row${flaggedLessons.length > 0 ? ' student-summary__subject-row--review' : ''}`}
          >
            <div className="student-summary__subject-main">
              <span className="student-summary__subject-name">{subject.name}</span>
              <span className="student-summary__subject-status">
                {lessonLabel ?? (hasLessons ? 'Not started' : 'No lessons yet')}
              </span>
            </div>
            {flaggedLessons.length > 0 && (
              <ul className="student-summary__flagged-list">
                {flaggedLessons.map((flag) => (
                  <li key={flag.lessonId} className="student-summary__flagged-item">
                    <span className="student-summary__flagged-label">{flag.label}</span>
                    <button
                      type="button"
                      className="student-summary__flagged-remove"
                      aria-label={`Remove review flag for ${flag.label}`}
                      onClick={() => void handleRemoveFlag(flag.lessonId)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
