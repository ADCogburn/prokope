import { formatLessonLabel } from '../db'
import { formatDayHeader, type WeeklyLessonPlanRow } from './weeklyLessonPlan'
import './WeeklyLessonPlanReport.css'

interface WeeklyLessonPlanReportProps {
  weekDates: Date[]
  rows: WeeklyLessonPlanRow[]
}

/**
 * The class-wide weekly lesson-plan grid, per #23's addendum -- reproduces
 * the teacher's existing pacing-guide template exactly (title, static
 * note, 6-column table with a gray header row and gray subject-label
 * cells), with the Lesson/Notes cells populated from projectSubjectWeek's
 * output instead of being hand-filled.
 */
export function WeeklyLessonPlanReport({ weekDates, rows }: WeeklyLessonPlanReportProps) {
  return (
    <div className="weekly-plan">
      <h1 className="weekly-plan__title">Weekly Lesson Plan Template/Pacing Guide</h1>
      <p className="weekly-plan__note">*please note days of any tests/quizzes in plans.</p>
      <table className="weekly-plan__table">
        <thead>
          <tr>
            <th scope="col">Week</th>
            {weekDates.map((date) => (
              <th scope="col" key={date.toISOString()}>
                {formatDayHeader(date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ subject, days }) => (
            <tr key={subject.id}>
              <th scope="row">{subject.name}</th>
              {days.map(({ date, lesson }) => (
                <td key={date.toISOString()}>
                  <p>Lesson: {lesson && formatLessonLabel(lesson)}</p>
                  <p>Notes: {lesson?.description}</p>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
