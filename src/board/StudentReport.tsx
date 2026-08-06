import type { StudentReportData } from './studentReportData'
import './StudentReport.css'

interface StudentReportProps {
  data: StudentReportData
}

/**
 * One printable page for a single student, per #11: for each subject, the
 * current lesson by title (not the raw {unit, lesson_in_unit} id) and
 * whether it's flagged for review. A point-in-time snapshot -- see
 * studentReportData.ts.
 */
export function StudentReport({ data }: StudentReportProps) {
  return (
    <div className="student-report">
      <h1 className="student-report__name">{data.student.name}</h1>
      <ul className="student-report__subjects">
        {data.subjectRows.map(({ subject, lessonTitle, hasLessons, reviewFlagged }) => (
          <li key={subject.id} className="student-report__subject">
            <span className="student-report__subject-name">{subject.name}</span>
            <span className="student-report__lesson">
              {!hasLessons ? 'No lessons yet' : (lessonTitle ?? 'Not started')}
            </span>
            {reviewFlagged && <span className="student-report__flag">Flagged for review</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
