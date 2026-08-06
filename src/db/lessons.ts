import { db, type LessonRow } from './schema'

export interface LessonPosition {
  unit: number
  lesson_in_unit: number
}

export interface CreateLessonInput {
  subject_id: string
  unit: number
  lesson_in_unit: number
  title: string
  description: string
}

export async function createLesson(input: CreateLessonInput): Promise<LessonRow> {
  const now = new Date().toISOString()
  const row: LessonRow = {
    id: crypto.randomUUID(),
    subject_id: input.subject_id,
    unit: input.unit,
    lesson_in_unit: input.lesson_in_unit,
    title: input.title,
    description: input.description,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }
  await db.lesson.add(row)
  return row
}

export async function listLessonsForSubject(subjectId: string): Promise<LessonRow[]> {
  const rows = await db.lesson.where('subject_id').equals(subjectId).toArray()
  return rows
    .filter((row) => row.deleted_at === null)
    .sort((a, b) => a.unit - b.unit || a.lesson_in_unit - b.lesson_in_unit)
}

/** Bulk form of listLessonsForSubject, for loading a whole class's curriculum in one query. */
export async function listLessonsForSubjects(subjectIds: string[]): Promise<LessonRow[]> {
  if (subjectIds.length === 0) {
    return []
  }
  const rows = await db.lesson.where('subject_id').anyOf(subjectIds).toArray()
  return rows
    .filter((row) => row.deleted_at === null)
    .sort((a, b) => a.unit - b.unit || a.lesson_in_unit - b.lesson_in_unit)
}

export async function getLessonByPosition(
  subjectId: string,
  unit: number,
  lessonInUnit: number,
): Promise<LessonRow | undefined> {
  const row = await db.lesson
    .where('[subject_id+unit+lesson_in_unit]')
    .equals([subjectId, unit, lessonInUnit])
    .first()
  return row && row.deleted_at === null ? row : undefined
}

/**
 * "Next lesson" per #22's addendum: there's no `units` table and nothing
 * tracks a unit's length, so this can't be computed by incrementing
 * lesson_in_unit and checking a bound. Instead it's the lesson with the
 * smallest (unit, lesson_in_unit) tuple, lexicographically, strictly
 * greater than `after` -- which, as long as lesson_in_unit restarts at 1
 * per unit, naturally crosses a unit boundary with no special-casing.
 *
 * Pure/sync so the board UI can also use it against an already-loaded,
 * possibly-multi-subject batch of lessons (e.g. from listLessonsForSubjects)
 * to show a Next/Complete control without a per-cell DB round trip.
 */
export function findNextLesson(
  lessons: LessonRow[],
  subjectId: string,
  after: LessonPosition,
): LessonRow | undefined {
  return lessons
    .filter((row) => row.subject_id === subjectId && row.deleted_at === null)
    .sort((a, b) => a.unit - b.unit || a.lesson_in_unit - b.lesson_in_unit)
    .find(
      (row) => row.unit > after.unit || (row.unit === after.unit && row.lesson_in_unit > after.lesson_in_unit),
    )
}

export async function getNextLessonInSubject(
  subjectId: string,
  after: LessonPosition,
): Promise<LessonRow | undefined> {
  const rows = await listLessonsForSubject(subjectId)
  return findNextLesson(rows, subjectId, after)
}

export async function deleteLesson(id: string): Promise<void> {
  const now = new Date().toISOString()
  await db.lesson.update(id, { deleted_at: now, updated_at: now })
}

/** "1.2 - Fractions": a lesson's {unit, lesson_in_unit} position alongside its title, for reports where the raw title alone doesn't tell a teacher where it falls in the curriculum. */
export function formatLessonLabel(lesson: LessonRow): string {
  return `${lesson.unit}.${lesson.lesson_in_unit} - ${lesson.title}`
}
