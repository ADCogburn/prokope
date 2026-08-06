import type { StudentReportData } from './studentReportData'
import './StudentReport.css'

interface StudentReportProps {
  data: StudentReportData
}

/**
 * One printable page for a single student, per #11: for each subject, the
 * current lesson labeled by its unit/lesson number and title (e.g.
 * "1.1 - Practicing addition") and whether it's flagged for review. A
 * point-in-time snapshot -- see studentReportData.ts.
 */
export function StudentReport({ data }: StudentReportProps) {
  return (
    <div className="student-report">
      <h1 className="student-report__name">{data.student.name}</h1>
      <table className="student-report__table">
        <thead>
          <tr>
            <th scope="col">Subject</th>
            <th scope="col">Current Lesson</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.subjectRows.map(({ subject, lessonLabel, hasLessons, reviewFlagged }) => (
            <tr key={subject.id} className={reviewFlagged ? 'student-report__row--flagged' : undefined}>
              <th scope="row">{subject.name}</th>
              <td>{!hasLessons ? 'No lessons yet' : (lessonLabel ?? 'Not started')}</td>
              <td className="student-report__status">{reviewFlagged ? 'Flagged for review' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
