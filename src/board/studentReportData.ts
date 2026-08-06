import { formatLessonLabel, positionOf } from '../db'
import type { LessonRow, ProgressRow, StudentRow, SubjectRow } from '../db/schema'

export interface StudentReportSubjectRow {
  subject: SubjectRow
  /** The current lesson's unit/lesson number and title (e.g. "1.1 - Practicing addition"), per #11. undefined covers both "not started yet" and "no lessons defined" (see hasLessons). */
  lessonLabel: string | undefined
  hasLessons: boolean
  reviewFlagged: boolean
}

export interface StudentReportData {
  student: StudentRow
  subjectRows: StudentReportSubjectRow[]
}

/** Per-student printable report data, per #11: current lesson (by title) and review-flag status for every subject, as of generation time. `subjects` order is preserved (already the teacher's configured position order). */
export function buildStudentReport(
  student: StudentRow,
  subjects: SubjectRow[],
  lessons: LessonRow[],
  progress: ProgressRow[],
): StudentReportData {
  const subjectRows = subjects.map((subject) => {
    const subjectLessons = lessons.filter((lesson) => lesson.subject_id === subject.id)
    const progressRow = progress.find((row) => row.student_id === student.id && row.subject_id === subject.id)
    const step = positionOf(progressRow)
    const currentLesson = subjectLessons.find(
      (lesson) => lesson.unit === step.unit && lesson.lesson_in_unit === step.lesson_in_unit,
    )

    return {
      subject,
      lessonLabel: currentLesson ? formatLessonLabel(currentLesson) : undefined,
      hasLessons: subjectLessons.length > 0,
      reviewFlagged: Boolean(progressRow?.review),
    }
  })

  return { student, subjectRows }
}
