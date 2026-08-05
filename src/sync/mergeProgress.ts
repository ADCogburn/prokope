import type { ProgressRow } from '../db'

/**
 * The HLC-based LWW-Register CRDT merge decided in #2/#6: step and review
 * are independent per-field registers, each won by whichever side's HLC
 * sorts later (hlc.ts's padded encoding makes this a plain string compare),
 * tie-broken by client_id so two devices racing on the same field always
 * agree on the winner. Mirrored by the server's HlcWins in
 * server/Sync/SyncEndpoints.cs -- kept in sync by hand since the two run in
 * different languages.
 *
 * `incoming`'s id is always the merge result's id: the caller is
 * responsible for deciding which id is canonical (see applyRemoteProgress),
 * this function only resolves field-level winners.
 */
export function mergeProgressRows(existing: ProgressRow, incoming: ProgressRow): ProgressRow {
  const stepFromIncoming = hlcWins(
    incoming.step_hlc,
    incoming.step_client_id,
    existing.step_hlc,
    existing.step_client_id,
  )
  const reviewFromIncoming = hlcWins(
    incoming.review_hlc,
    incoming.review_client_id,
    existing.review_hlc,
    existing.review_client_id,
  )

  return {
    id: incoming.id,
    student_id: incoming.student_id,
    subject_id: incoming.subject_id,
    step_unit: stepFromIncoming ? incoming.step_unit : existing.step_unit,
    step_lesson_in_unit: stepFromIncoming ? incoming.step_lesson_in_unit : existing.step_lesson_in_unit,
    step_hlc: stepFromIncoming ? incoming.step_hlc : existing.step_hlc,
    step_client_id: stepFromIncoming ? incoming.step_client_id : existing.step_client_id,
    review: reviewFromIncoming ? incoming.review : existing.review,
    review_hlc: reviewFromIncoming ? incoming.review_hlc : existing.review_hlc,
    review_client_id: reviewFromIncoming ? incoming.review_client_id : existing.review_client_id,
    updated_at: incoming.updated_at > existing.updated_at ? incoming.updated_at : existing.updated_at,
  }
}

function hlcWins(
  challengerHlc: string,
  challengerClientId: string,
  incumbentHlc: string,
  incumbentClientId: string,
): boolean {
  if (challengerHlc !== incumbentHlc) {
    return challengerHlc > incumbentHlc
  }
  return challengerClientId > incumbentClientId
}
