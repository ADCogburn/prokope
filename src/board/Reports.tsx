import { useMemo, useState } from 'react'
import type { ClassRow, LessonRow, ProgressRow, StudentRow, SubjectRow } from '../db/schema'
import { buildStudentReport } from './studentReportData'
import { buildWeeklyLessonPlan } from './weeklyLessonPlan'
import { StudentReport } from './StudentReport'
import { WeeklyLessonPlanReport } from './WeeklyLessonPlanReport'
import './Reports.css'

type ReportType = 'per-student' | 'weekly-plan'
const ALL_STUDENTS = 'all'

interface ReportsProps {
  classRow: ClassRow
  subjects: SubjectRow[]
  students: StudentRow[]
  lessons: LessonRow[]
  progress: ProgressRow[]
  onBack: () => void
}

/**
 * The reports screen, per #23: a dropdown picks between the per-student
 * progress report (#11's scope, the default -- individually or batched for
 * the whole class) and the class-wide weekly lesson-plan grid (#23's
 * addendum). The two are mutually exclusive views, never combined on one
 * page. Printing is left to the browser's own print (Ctrl/Cmd+P covers it
 * too; the button is a discoverable affordance, not the only way in).
 */
export function Reports({ classRow, subjects, students, lessons, progress, onBack }: ReportsProps) {
  const [reportType, setReportType] = useState<ReportType>('per-student')
  const [studentSelection, setStudentSelection] = useState<string>(ALL_STUDENTS)

  const selectedStudents = useMemo(() => {
    if (studentSelection === ALL_STUDENTS) return students
    return students.filter((student) => student.id === studentSelection)
  }, [studentSelection, students])

  const weeklyPlan = useMemo(
    () => buildWeeklyLessonPlan(subjects, lessons, progress, students.map((student) => student.id), new Date()),
    [subjects, lessons, progress, students],
  )

  return (
    <div className="reports">
      <header className="reports__header">
        <button type="button" className="reports__back" onClick={onBack}>
          ← Back to board
        </button>
        <h1>Reports</h1>
        <p>{classRow.name}</p>
      </header>

      <div className="reports__controls">
        <div className="reports__field">
          <label htmlFor="report-type">Report type</label>
          <select
            id="report-type"
            value={reportType}
            onChange={(event) => setReportType(event.target.value as ReportType)}
          >
            <option value="per-student">Per-Student Progress</option>
            <option value="weekly-plan">Weekly Lesson Plan</option>
          </select>
        </div>

        {reportType === 'per-student' && (
          <div className="reports__field">
            <label htmlFor="report-student">Student</label>
            <select
              id="report-student"
              value={studentSelection}
              onChange={(event) => setStudentSelection(event.target.value)}
            >
              <option value={ALL_STUDENTS}>All students</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <button type="button" className="reports__print" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="reports__pages">
        {reportType === 'per-student' ? (
          selectedStudents.length === 0 ? (
            <p className="reports__empty">No students to report on.</p>
          ) : (
            selectedStudents.map((student) => (
              <div key={student.id} className="reports__page">
                <StudentReport data={buildStudentReport(student, subjects, lessons, progress)} />
              </div>
            ))
          )
        ) : (
          <div className="reports__page">
            <WeeklyLessonPlanReport weekDates={weeklyPlan.weekDates} rows={weeklyPlan.rows} />
          </div>
        )}
      </div>
    </div>
  )
}
