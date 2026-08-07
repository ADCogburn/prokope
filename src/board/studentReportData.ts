import { formatLessonLabel, positionOf } from '../db'
import type { LessonRow, ProgressRow, ReviewFlagRow, StudentRow, SubjectRow } from '../db/schema'

export interface StudentReportFlaggedLesson {
  lessonId: string
  /** e.g. "1.2 - Fractions", per formatLessonLabel's convention. */
  label: string
}

export interface StudentReportSubjectRow {
  subject: SubjectRow
  /** The current lesson's unit/lesson number and title (e.g. "1.1 - Practicing addition"), per #11. undefined covers both "not started yet" and "no lessons defined" (see hasLessons). */
  lessonLabel: string | undefined
  hasLessons: boolean
  /**
   * Every lesson in this subject currently flagged for this student, in
   * curriculum order (unit, then lesson_in_unit). Position-independent, per
   * #155: a flagged lesson stays listed here even after the student's
   * current position (see lessonLabel above) has moved past it.
   */
  flaggedLessons: StudentReportFlaggedLesson[]
}

export interface StudentReportData {
  student: StudentRow
  subjectRows: StudentReportSubjectRow[]
}

/**
 * Per-student printable report data, per #11 and #155: current lesson (by
 * title) plus the full list of flagged lessons for every subject, as of
 * generation time. `subjects` order is preserved (already the teacher's
 * configured position order).
 *
 * Deliberately its own function rather than reusing studentSummaryData's
 * buildStudentSummary, even though the two are structurally similar --
 * see ADR-0009. The print report stays scope-frozen to its own tickets
 * (#11, #155) and shouldn't couple its growth to Student Summary's, or
 * vice versa.
 *
 * `flaggedLessons` is sourced from ReviewFlag rows (#152/ADR-0011), which
 * key a flag by (student, lesson) rather than by subject position -- so a
 * lesson stays flagged here regardless of whether the student's current
 * position (`lessonLabel` above) has since moved past it.
 */
export function buildStudentReport(
  student: StudentRow,
  subjects: SubjectRow[],
  lessons: LessonRow[],
  progress: ProgressRow[],
  reviewFlags: ReviewFlagRow[],
): StudentReportData {
  const subjectRows = subjects.map((subject) => {
    const subjectLessons = lessons.filter((lesson) => lesson.subject_id === subject.id)
    const progressRow = progress.find((row) => row.student_id === student.id && row.subject_id === subject.id)
    const step = positionOf(progressRow)
    const currentLesson = subjectLessons.find(
      (lesson) => lesson.unit === step.unit && lesson.lesson_in_unit === step.lesson_in_unit,
    )

    const flaggedLessons = subjectLessons
      .filter((lesson) =>
        reviewFlags.some((row) => row.student_id === student.id && row.lesson_id === lesson.id && row.flagged),
      )
      .sort((a, b) => a.unit - b.unit || a.lesson_in_unit - b.lesson_in_unit)
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
