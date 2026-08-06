import type { LessonPosition } from '../db'
import { findNextLesson, positionOf } from '../db'
import type { LessonRow, ProgressRow, SubjectRow } from '../db/schema'

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * The "upcoming week"'s Monday through Friday, per #23's addendum: the
 * Monday on or after `reference` (so a Monday reference stays put, any
 * other weekday rolls forward to the coming Monday), then the four days
 * after it.
 */
export function getUpcomingWeekDates(reference: Date): [Date, Date, Date, Date, Date] {
  const offsetToMonday = (1 - reference.getDay() + 7) % 7
  const monday = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + offsetToMonday)
  return [0, 1, 2, 3, 4].map(
    (i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i),
  ) as [Date, Date, Date, Date, Date]
}

export function formatDayHeader(date: Date): string {
  return `${WEEKDAY_NAMES[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`
}

/**
 * A student's step flattened to its ordinal position within a subject's
 * ordered lesson list (`lessons` must already be sorted ascending by
 * (unit, lesson_in_unit), as listLessonsForSubject(s) guarantees).
 * -1 means "before the first lesson" (covers the {0, 0} not-started
 * sentinel, since real lessons start at unit >= 1). A step that doesn't
 * exactly match a lesson resolves to the closest preceding one; a step past
 * every defined lesson clamps to the last index.
 */
export function ordinalOfStep(lessons: LessonRow[], step: LessonPosition): number {
  let count = 0
  for (const lesson of lessons) {
    const atOrBefore =
      lesson.unit < step.unit || (lesson.unit === step.unit && lesson.lesson_in_unit <= step.lesson_in_unit)
    if (!atOrBefore) break
    count++
  }
  return count - 1
}

export interface WeekDayProjection {
  date: Date
  lesson: LessonRow | undefined
}

/**
 * Per-subject weekly projection, per #23's addendum. Monday is the rounded
 * average ordinal across every id in `studentIds` (progress rows for other
 * subjects are ignored); Tuesday-Friday each walk one lesson forward from
 * the previous day via the same "next lesson" rule the board's advance
 * control uses. Once a day walks past the subject's last lesson, every
 * remaining day that week is lessonless too (findNextLesson keeps
 * returning undefined from an undefined `current`).
 */
export function projectSubjectWeek(
  lessons: LessonRow[],
  subjectId: string,
  progressRows: ProgressRow[],
  studentIds: string[],
  weekDates: Date[],
): WeekDayProjection[] {
  if (lessons.length === 0) {
    return weekDates.map((date) => ({ date, lesson: undefined }))
  }

  const progressByStudent = new Map(
    progressRows.filter((row) => row.subject_id === subjectId).map((row) => [row.student_id, row]),
  )
  const ordinals = studentIds.map((id) => ordinalOfStep(lessons, positionOf(progressByStudent.get(id))))
  const avgOrdinal = ordinals.length === 0 ? -1 : ordinals.reduce((sum, o) => sum + o, 0) / ordinals.length
  const roundedOrdinal = Math.min(Math.max(Math.round(avgOrdinal), 0), lessons.length - 1)

  const monday = lessons[roundedOrdinal]
  const days: WeekDayProjection[] = [{ date: weekDates[0], lesson: monday }]

  let current: LessonRow | undefined = monday
  for (let i = 1; i < weekDates.length; i++) {
    current = current
      ? findNextLesson(lessons, subjectId, { unit: current.unit, lesson_in_unit: current.lesson_in_unit })
      : undefined
    days.push({ date: weekDates[i], lesson: current })
  }

  return days
}

export interface WeeklyLessonPlanRow {
  subject: SubjectRow
  days: WeekDayProjection[]
}

export interface WeeklyLessonPlan {
  weekDates: Date[]
  rows: WeeklyLessonPlanRow[]
}

/** Assembles a whole class's weekly lesson-plan grid, per #23's addendum. `subjects` order is preserved (already the teacher's configured position order). */
export function buildWeeklyLessonPlan(
  subjects: SubjectRow[],
  lessons: LessonRow[],
  progress: ProgressRow[],
  studentIds: string[],
  referenceDate: Date,
): WeeklyLessonPlan {
  const weekDates = getUpcomingWeekDates(referenceDate)
  const rows = subjects.map((subject) => ({
    subject,
    days: projectSubjectWeek(
      lessons.filter((lesson) => lesson.subject_id === subject.id),
      subject.id,
      progress,
      studentIds,
      weekDates,
    ),
  }))
  return { weekDates, rows }
}
