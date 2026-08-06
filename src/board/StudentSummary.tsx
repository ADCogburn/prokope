import type { ClassRow, LessonRow, ProgressRow, StudentRow, SubjectRow } from '../db/schema'
import { buildStudentSummary } from './studentSummaryData'
import './StudentSummary.css'

interface StudentSummaryProps {
  classRow: ClassRow
  student: StudentRow
  subjects: SubjectRow[]
  lessons: LessonRow[]
  progress: ProgressRow[]
  onBack: () => void
}

/**
 * The Student Summary page, per #107: a read-only, per-student overview of
 * current standing across every subject in the class, reached at
 * `/class/:classId/student/:studentId`. See the "Student Summary" glossary
 * entry in CONTEXT.md and ADR-0009 for why this has its own data builder
 * (buildStudentSummary) rather than reusing the printable report's.
 */
export function StudentSummary({ classRow, student, subjects, lessons, progress, onBack }: StudentSummaryProps) {
  const summary = buildStudentSummary(student, subjects, lessons, progress)

  return (
    <div className="student-summary">
      <header className="student-summary__header">
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
      </header>
      <ul className="student-summary__subject-list">
        {summary.subjectRows.map(({ subject, lessonLabel, hasLessons, reviewFlagged }) => (
          <li
            key={subject.id}
            className={`student-summary__subject-row${reviewFlagged ? ' student-summary__subject-row--review' : ''}`}
          >
            <span className="student-summary__subject-name">{subject.name}</span>
            <span className="student-summary__subject-status">
              {lessonLabel ?? (hasLessons ? 'Not started' : 'No lessons yet')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
