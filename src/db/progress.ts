import { db, type ProgressRow } from './schema'
import { getClientId } from './clientId'
import { nextHlc } from './hlc'

export interface ProgressStep {
  unit: number
  lesson_in_unit: number
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
