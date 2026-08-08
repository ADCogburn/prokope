import type { StudentReportData } from './studentReportData'
import './StudentReport.css'

interface StudentReportProps {
  data: StudentReportData
}

/**
 * One printable page for a single student, per #11 and #155: for each
 * subject, the current lesson labeled by its unit/lesson number and title
 * (e.g. "1.1 - Practicing addition"), plus every lesson in that subject
 * currently flagged for review -- listed regardless of whether the
 * student's current position has since moved past it. A point-in-time
 * snapshot -- see studentReportData.ts.
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
            <th scope="col">Flagged for Review</th>
          </tr>
        </thead>
        <tbody>
          {data.subjectRows.map(({ subject, lessonLabel, hasLessons, flaggedLessons }) => (
            <tr key={subject.id} className={flaggedLessons.length > 0 ? 'student-report__row--flagged' : undefined}>
              <th scope="row">{subject.name}</th>
              <td>{!hasLessons ? 'No lessons yet' : (lessonLabel ?? 'Not started')}</td>
              <td className="student-report__status">
                {flaggedLessons.length > 0 ? (
                  <ul className="student-report__flag-list">
                    {flaggedLessons.map((lesson) => (
                      <li key={lesson.lessonId}>{lesson.label}</li>
                    ))}
                  </ul>
                ) : (
                  ''
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
