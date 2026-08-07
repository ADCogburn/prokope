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

/**
 * DB-level uniqueness on this position isn't viable (#135/ADR-0010:
 * IndexedDB drops a record from a compound index entirely when any key-path
 * component is null, so the live rows this must protect -- deleted_at: null
 * -- would never be indexed), so this checks the position against live rows
 * itself before inserting.
 */
export async function createLesson(input: CreateLessonInput): Promise<LessonRow> {
  const existing = await getLessonByPosition(input.subject_id, input.unit, input.lesson_in_unit)
  if (existing) {
    throw new Error(`A lesson already exists at unit ${input.unit}, lesson ${input.lesson_in_unit}.`)
  }
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
  // Not unique (#135/ADR-0010): a soft-deleted lesson can share this
  // position with the live one, so this must check every match rather than
  // taking .first().
  const rows = await db.lesson
    .where('[subject_id+unit+lesson_in_unit]')
    .equals([subjectId, unit, lessonInUnit])
    .toArray()
  return rows.find((row) => row.deleted_at === null)
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

/**
 * "Previous lesson" -- the inverse of findNextLesson, for #77's "Un-advance":
 * the lesson with the largest (unit, lesson_in_unit) tuple, lexicographically,
 * strictly less than `before`. Same reasoning as findNextLesson applies in
 * reverse -- no `units` table means this can't be computed by decrementing
 * lesson_in_unit and checking a bound, so it naturally crosses a unit
 * boundary backward with no special-casing either.
 *
 * Pure/sync so the board UI can also use it against an already-loaded batch
 * of lessons, same as findNextLesson.
 */
export function findPreviousLesson(
  lessons: LessonRow[],
  subjectId: string,
  before: LessonPosition,
): LessonRow | undefined {
  return lessons
    .filter((row) => row.subject_id === subjectId && row.deleted_at === null)
    .sort((a, b) => b.unit - a.unit || b.lesson_in_unit - a.lesson_in_unit)
    .find(
      (row) => row.unit < before.unit || (row.unit === before.unit && row.lesson_in_unit < before.lesson_in_unit),
    )
}

/**
 * Auto-suggest helper for the add-lesson form, per #74: one more than the
 * highest lesson_in_unit already used within `requestedUnit` for this
 * subject, or 1 if that unit has no lessons yet. Purely a convenience
 * default -- createLesson doesn't enforce contiguous numbering (see #73,
 * closed as not planned), and the teacher can overwrite the suggestion.
 */
export function getNextLessonPosition(
  lessons: LessonRow[],
  subjectId: string,
  requestedUnit: number,
): LessonPosition {
  const maxLessonInUnit = lessons
    .filter((row) => row.subject_id === subjectId && row.deleted_at === null && row.unit === requestedUnit)
    .reduce((max, row) => Math.max(max, row.lesson_in_unit), 0)
  return { unit: requestedUnit, lesson_in_unit: maxLessonInUnit + 1 }
}

/**
 * Auto-suggest helper for opening the add-lesson form, per #101: the last
 * unit used in this subject (or 1 if the subject has no lessons yet), paired
 * with the next available lesson number in that unit via getNextLessonPosition.
 */
export function getSuggestedNewLessonPosition(lessons: LessonRow[], subjectId: string): LessonPosition {
  const lastUnit = lessons
    .filter((row) => row.subject_id === subjectId && row.deleted_at === null)
    .reduce((max, row) => Math.max(max, row.unit), 0)
  return getNextLessonPosition(lessons, subjectId, lastUnit === 0 ? 1 : lastUnit)
}

export async function getNextLessonInSubject(
  subjectId: string,
  after: LessonPosition,
): Promise<LessonRow | undefined> {
  const rows = await listLessonsForSubject(subjectId)
  return findNextLesson(rows, subjectId, after)
}

export async function getPreviousLessonInSubject(
  subjectId: string,
  before: LessonPosition,
): Promise<LessonRow | undefined> {
  const rows = await listLessonsForSubject(subjectId)
  return findPreviousLesson(rows, subjectId, before)
}

export async function deleteLesson(id: string): Promise<void> {
  const now = new Date().toISOString()
  await db.lesson.update(id, { deleted_at: now, updated_at: now })
}

export interface UpdateLessonContentInput {
  unit: number
  lesson_in_unit: number
  title: string
  description: string
}

/**
 * Edits a lesson's unit, lesson number, title, and description in one write,
 * per #103. Widened from a title/description-only version (#33) now that
 * unit/lesson_in_unit have their first UI consumer -- callers are
 * responsible for guarding against a duplicate (subject_id, unit,
 * lesson_in_unit) position among the subject's other lessons before calling
 * this, the same check createLesson's caller already performs, since this
 * function itself doesn't have the sibling-lesson list to check against.
 */
export async function updateLessonContent(id: string, input: UpdateLessonContentInput): Promise<void> {
  const now = new Date().toISOString()
  await db.lesson.update(id, {
    unit: input.unit,
    lesson_in_unit: input.lesson_in_unit,
    title: input.title,
    description: input.description,
    updated_at: now,
  })
}

/** "1.2 - Fractions": a lesson's {unit, lesson_in_unit} position alongside its title, for reports where the raw title alone doesn't tell a teacher where it falls in the curriculum. */
export function formatLessonLabel(lesson: LessonRow): string {
  return `${lesson.unit}.${lesson.lesson_in_unit} - ${lesson.title}`
}

/**
 * "Bulk Generate" (#162): scaffolds placeholder lessons across a subject's
 * fixed unit x lesson_in_unit grid (1..unitCount x 1..lessonsPerUnit) in one
 * call. For each grid position, checks getLessonByPosition -- a position
 * with a live lesson is skipped and left untouched; an empty position, or
 * one occupied only by a soft-deleted lesson (ADR-0010: soft-deleted rows
 * don't count as occupying a position), gets a new row via the unmodified
 * createLesson with title "Untitled" and an empty description. The
 * soft-deleted row itself, if any, is left as-is -- never restored.
 *
 * Never touches units/lessons outside the requested grid. Returns the ids of
 * only the lessons this call created, in grid order (unit-major, then
 * lesson_in_unit) -- callers should not rely on that order.
 */
export async function bulkGenerateLessons(
  subjectId: string,
  unitCount: number,
  lessonsPerUnit: number,
): Promise<string[]> {
  const createdIds: string[] = []
  for (let unit = 1; unit <= unitCount; unit++) {
    for (let lessonInUnit = 1; lessonInUnit <= lessonsPerUnit; lessonInUnit++) {
      const existing = await getLessonByPosition(subjectId, unit, lessonInUnit)
      if (existing) {
        continue
      }
      const created = await createLesson({
        subject_id: subjectId,
        unit,
        lesson_in_unit: lessonInUnit,
        title: 'Untitled',
        description: '',
      })
      createdIds.push(created.id)
    }
  }
  return createdIds
}
