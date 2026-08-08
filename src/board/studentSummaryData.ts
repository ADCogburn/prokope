import { formatLessonLabel, positionOf } from '../db'
import type { LessonRow, ProgressRow, ReviewFlagRow, StudentRow, SubjectRow } from '../db/schema'

export interface StudentSummarySubjectRow {
  subject: SubjectRow
  /** The current lesson's unit/lesson number and title (e.g. "1.1 - Practicing addition"), per #107. undefined covers both "not started yet" and "no lessons defined" (see hasLessons). */
  lessonLabel: string | undefined
  hasLessons: boolean
  reviewFlagged: boolean
}

export interface StudentSummaryData {
  student: StudentRow
  subjectRows: StudentSummarySubjectRow[]
}

/**
 * Data for the Student Summary page, per #107: current lesson (by title)
 * and review-flag status for every subject, as of render time. `subjects`
 * order is preserved (already the teacher's configured position order).
 *
 * Deliberately its own function rather than reusing studentReportData's
 * buildStudentReport, even though today's output shape is identical -- see
 * ADR-0009. Student Summary is the intended growth point for future
 * student-detail features and shouldn't couple that growth to the printable
 * report's scope, or vice versa.
 *
 * `reviewFlagged` here is interim, current-lesson-only behavior per #152:
 * ReviewFlag is keyed by (student, lesson), so this only surfaces whether
 * the *current* lesson in each subject carries a flag -- the full
 * flagged-lesson list (past and upcoming lessons too) is #153's scope.
 */
export function buildStudentSummary(
  student: StudentRow,
  subjects: SubjectRow[],
  lessons: LessonRow[],
  progress: ProgressRow[],
  reviewFlags: ReviewFlagRow[],
): StudentSummaryData {
  const subjectRows = subjects.map((subject) => {
    const subjectLessons = lessons.filter((lesson) => lesson.subject_id === subject.id)
    const progressRow = progress.find((row) => row.student_id === student.id && row.subject_id === subject.id)
    const step = positionOf(progressRow)
    const currentLesson = subjectLessons.find(
      (lesson) => lesson.unit === step.unit && lesson.lesson_in_unit === step.lesson_in_unit,
    )
    const reviewFlagged = currentLesson
      ? reviewFlags.some(
          (row) => row.student_id === student.id && row.lesson_id === currentLesson.id && row.flagged,
        )
      : false

    return {
      subject,
      lessonLabel: currentLesson ? formatLessonLabel(currentLesson) : undefined,
      hasLessons: subjectLessons.length > 0,
      reviewFlagged,
    }
  })

  return { student, subjectRows }
}
