import { formatLessonLabel, positionOf } from '../db'
import type { LessonRow, ProgressRow, ReviewFlagRow, StudentRow, SubjectRow } from '../db/schema'

/** One flagged lesson within a subject, in curriculum order. See StudentSummarySubjectRow.flaggedLessons. */
export interface StudentSummaryFlaggedLesson {
  lessonId: string
  /** e.g. "1.2 - Fractions" -- see formatLessonLabel. */
  label: string
}

export interface StudentSummarySubjectRow {
  subject: SubjectRow
  /** The current lesson's unit/lesson number and title (e.g. "1.1 - Practicing addition"), per #107. undefined covers both "not started yet" and "no lessons defined" (see hasLessons). */
  lessonLabel: string | undefined
  hasLessons: boolean
  /**
   * Every lesson in this subject with an active (flagged: true) ReviewFlag
   * row for this student, in curriculum order (unit, lesson_in_unit) --
   * independent of the student's current position, so a flagged lesson
   * stays listed even after the student advances past it. Per #154, this
   * replaces #152's interim current-lesson-only `reviewFlagged` boolean.
   */
  flaggedLessons: StudentSummaryFlaggedLesson[]
}

export interface StudentSummaryData {
  student: StudentRow
  subjectRows: StudentSummarySubjectRow[]
}

/**
 * Data for the Student Summary page, per #107/#154: current lesson (by
 * title) and the full list of flagged lessons for every subject, as of
 * render time. `subjects` order is preserved (already the teacher's
 * configured position order); `lessons` is assumed already sorted by
 * (unit, lesson_in_unit) per subject (the shape `listLessonsForSubjects`
 * returns), so `flaggedLessons` comes out in curriculum order for free.
 *
 * Deliberately its own function rather than reusing studentReportData's
 * buildStudentReport, even though today's per-subject "current lesson"
 * output is similar -- see ADR-0009. Student Summary is the intended growth
 * point for future student-detail features and shouldn't couple that growth
 * to the printable report's scope, or vice versa.
 */
export function buildStudentSummary(
  student: StudentRow,
  subjects: SubjectRow[],
  lessons: LessonRow[],
  progress: ProgressRow[],
  reviewFlags: ReviewFlagRow[],
): StudentSummaryData {
  const flaggedLessonIds = new Set(
    reviewFlags
      .filter((row) => row.student_id === student.id && row.flagged)
      .map((row) => row.lesson_id),
  )

  const subjectRows = subjects.map((subject) => {
    const subjectLessons = lessons.filter((lesson) => lesson.subject_id === subject.id)
    const progressRow = progress.find((row) => row.student_id === student.id && row.subject_id === subject.id)
    const step = positionOf(progressRow)
    const currentLesson = subjectLessons.find(
      (lesson) => lesson.unit === step.unit && lesson.lesson_in_unit === step.lesson_in_unit,
    )

    const flaggedLessons = subjectLessons
      .filter((lesson) => flaggedLessonIds.has(lesson.id))
      .map((lesson) => ({ lessonId: lesson.id, label: formatLessonLabel(lesson) }))

    return {
      subject,
      lessonLabel: currentLesson ? formatLessonLabel(currentLesson) : undefined,
      hasLessons: subjectLessons.length > 0,
      flaggedLessons,
    }
  })

  return { student, subjectRows }
}
