import { db, type ReviewFlagRow } from './schema'
import { getClientId } from './clientId'
import { nextHlc } from './hlc'

/**
 * #152/ADR-0011: review moved off Progress (which was one flag per student
 * per subject, tied only to the current lesson) onto its own entity keyed by
 * (student, lesson), so a flag can target any lesson -- past, current, or
 * upcoming -- independent of the student's current position. Mirrors
 * progress.ts's conventions: a single-field HLC+client-id LWW-register,
 * upserted by its natural key rather than by row id.
 */

async function findReviewFlagRow(
  studentId: string,
  lessonId: string,
): Promise<ReviewFlagRow | undefined> {
  return db.review_flag.where('[student_id+lesson_id]').equals([studentId, lessonId]).first()
}

export async function getReviewFlag(
  studentId: string,
  lessonId: string,
): Promise<ReviewFlagRow | undefined> {
  return findReviewFlagRow(studentId, lessonId)
}

/** Writes review_flag.flagged and stamps a fresh hlc/client_id pair for the (student, lesson) pair. */
export async function upsertReviewFlag(
  studentId: string,
  lessonId: string,
  flagged: boolean,
): Promise<ReviewFlagRow> {
  const now = new Date().toISOString()
  const hlc = nextHlc()
  const clientId = getClientId()
  const existing = await findReviewFlagRow(studentId, lessonId)

  const row: ReviewFlagRow = existing
    ? {
        ...existing,
        flagged,
        hlc,
        client_id: clientId,
        updated_at: now,
      }
    : {
        id: crypto.randomUUID(),
        student_id: studentId,
        lesson_id: lessonId,
        flagged,
        hlc,
        client_id: clientId,
        updated_at: now,
      }

  await db.review_flag.put(row)
  return row
}

export async function listReviewFlagsForStudents(studentIds: string[]): Promise<ReviewFlagRow[]> {
  if (studentIds.length === 0) {
    return []
  }
  return db.review_flag.where('student_id').anyOf(studentIds).toArray()
}
