import { db, type LessonRow, type ProgressRow } from './schema'
import { getClientId } from './clientId'
import { nextHlc } from './hlc'
import { getNextLessonInSubject } from './lessons'

export interface ProgressStep {
  unit: number
  lesson_in_unit: number
}

/** A progress row's current step, or the {0, 0} sentinel for "not started yet" if there's no row. */
export function positionOf(progress: ProgressRow | undefined): ProgressStep {
  if (!progress) {
    return { unit: 0, lesson_in_unit: 0 }
  }
  return { unit: progress.step_unit, lesson_in_unit: progress.step_lesson_in_unit }
}

async function findProgressRow(
  studentId: string,
  subjectId: string,
): Promise<ProgressRow | undefined> {
  return db.progress.where('[student_id+subject_id]').equals([studentId, subjectId]).first()
}

export async function getProgress(
  studentId: string,
  subjectId: string,
): Promise<ProgressRow | undefined> {
  return findProgressRow(studentId, subjectId)
}

/**
 * Writes progress.step and stamps a fresh step_hlc/step_client_id pair.
 * Never touches review/review_hlc/review_client_id on an existing row --
 * a concurrent edit to one field must not clobber the other's stamp.
 *
 * The one exception is creating a brand-new (student_id, subject_id) row:
 * review/review_hlc/review_client_id are non-nullable (mirroring Postgres),
 * so the initial `review: false` default is itself stamped with this same
 * write's HLC/client_id, same as any other first-write default in an
 * LWW-register scheme.
 */
export async function upsertProgressStep(
  studentId: string,
  subjectId: string,
  step: ProgressStep,
): Promise<ProgressRow> {
  const now = new Date().toISOString()
  const hlc = nextHlc()
  const clientId = getClientId()
  const existing = await findProgressRow(studentId, subjectId)

  const row: ProgressRow = existing
    ? {
        ...existing,
        step_unit: step.unit,
        step_lesson_in_unit: step.lesson_in_unit,
        step_hlc: hlc,
        step_client_id: clientId,
        updated_at: now,
      }
    : {
        id: crypto.randomUUID(),
        student_id: studentId,
        subject_id: subjectId,
        step_unit: step.unit,
        step_lesson_in_unit: step.lesson_in_unit,
        step_hlc: hlc,
        step_client_id: clientId,
        review: false,
        review_hlc: hlc,
        review_client_id: clientId,
        updated_at: now,
      }

  await db.progress.put(row)
  return row
}

/**
 * Writes progress.review and stamps a fresh review_hlc/review_client_id
 * pair. Never touches step/step_hlc/step_client_id on an existing row --
 * a concurrent edit to one field must not clobber the other's stamp.
 *
 * The one exception is creating a brand-new (student_id, subject_id) row:
 * step/step_hlc/step_client_id are non-nullable (mirroring Postgres), so
 * the initial `step: {unit: 0, lesson_in_unit: 0}` default is itself
 * stamped with this same write's HLC/client_id, same as any other
 * first-write default in an LWW-register scheme.
 */
export async function upsertProgressReview(
  studentId: string,
  subjectId: string,
  review: boolean,
): Promise<ProgressRow> {
  const now = new Date().toISOString()
  const hlc = nextHlc()
  const clientId = getClientId()
  const existing = await findProgressRow(studentId, subjectId)

  const row: ProgressRow = existing
    ? {
        ...existing,
        review,
        review_hlc: hlc,
        review_client_id: clientId,
        updated_at: now,
      }
    : {
        id: crypto.randomUUID(),
        student_id: studentId,
        subject_id: subjectId,
        step_unit: 0,
        step_lesson_in_unit: 0,
        step_hlc: hlc,
        step_client_id: clientId,
        review,
        review_hlc: hlc,
        review_client_id: clientId,
        updated_at: now,
      }

  await db.progress.put(row)
  return row
}

export async function listProgressForStudents(studentIds: string[]): Promise<ProgressRow[]> {
  if (studentIds.length === 0) {
    return []
  }
  return db.progress.where('student_id').anyOf(studentIds).toArray()
}

/**
 * Advances a student to the next lesson in a subject, per #22's addendum:
 * "next" is whatever getNextLessonInSubject resolves to from the student's
 * current step (or {0, 0} if they have no progress row yet). Returns the
 * lesson advanced to, or undefined -- leaving progress untouched -- when
 * the student is already on the subject's last lesson.
 */
export async function advanceProgress(
  studentId: string,
  subjectId: string,
): Promise<LessonRow | undefined> {
  const current = await findProgressRow(studentId, subjectId)
  const after = positionOf(current)

  const next = await getNextLessonInSubject(subjectId, after)
  if (!next) {
    return undefined
  }

  await upsertProgressStep(studentId, subjectId, { unit: next.unit, lesson_in_unit: next.lesson_in_unit })
  return next
}

/**
 * Moves a student directly to an arbitrary lesson in a subject (#44's
 * "Jump to lesson..."), forward or backward, regardless of how many lessons
 * away it is from their current position. A thin wrapper around
 * upsertProgressStep, which already accepts any {unit, lesson_in_unit} pair
 * with no directional constraint and already leaves
 * review/review_hlc/review_client_id untouched -- mirrors how
 * advanceProgress wraps the same primitive.
 */
export async function jumpToLesson(
  studentId: string,
  subjectId: string,
  lesson: LessonRow,
): Promise<ProgressRow> {
  return upsertProgressStep(studentId, subjectId, { unit: lesson.unit, lesson_in_unit: lesson.lesson_in_unit })
}

/** One student's pre-advance position, captured so a bulk advance can be undone. */
export interface BulkAdvanceEntry {
  studentId: string
  previous: ProgressStep
}

/**
 * Advances every given student one lesson in one subject (#43's "Bulk
 * Advance"). Reuses advanceProgress's own next-lesson rule per student, so a
 * student already on the subject's last lesson (or a subject with no
 * lessons) is silently skipped -- same as the single-student advance
 * button. Returns only the students actually advanced, each paired with
 * their pre-advance position, so the caller can undo the whole batch by
 * writing each entry's `previous` back via upsertProgressStep.
 */
export async function bulkAdvanceProgress(
  studentIds: string[],
  subjectId: string,
): Promise<BulkAdvanceEntry[]> {
  const advanced: BulkAdvanceEntry[] = []
  for (const studentId of studentIds) {
    const current = await findProgressRow(studentId, subjectId)
    const previous = positionOf(current)

    const next = await getNextLessonInSubject(subjectId, previous)
    if (!next) {
      continue
    }

    await upsertProgressStep(studentId, subjectId, { unit: next.unit, lesson_in_unit: next.lesson_in_unit })
    advanced.push({ studentId, previous })
  }
  return advanced
}
