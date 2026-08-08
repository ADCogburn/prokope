import type { ReviewFlagRow } from '../db'

/**
 * #152/ADR-0011: the same HLC-based LWW-Register CRDT merge mergeProgress.ts
 * applies to progress.step, now for review_flag.flagged -- won by whichever
 * side's HLC sorts later (hlc.ts's padded encoding makes this a plain string
 * compare), tie-broken by client_id so two devices racing on the same
 * (student, lesson) pair always agree on the winner. Mirrored by the
 * server's HlcWins in server/Sync/SyncEndpoints.cs -- kept in sync by hand
 * since the two run in different languages.
 *
 * `incoming`'s id is always the merge result's id: the caller is
 * responsible for deciding which id is canonical (see
 * applyRemoteReviewFlag), this function only resolves the field-level
 * winner.
 */
export function mergeReviewFlagRows(existing: ReviewFlagRow, incoming: ReviewFlagRow): ReviewFlagRow {
  const flaggedFromIncoming = hlcWins(incoming.hlc, incoming.client_id, existing.hlc, existing.client_id)

  return {
    id: incoming.id,
    student_id: incoming.student_id,
    lesson_id: incoming.lesson_id,
    flagged: flaggedFromIncoming ? incoming.flagged : existing.flagged,
    hlc: flaggedFromIncoming ? incoming.hlc : existing.hlc,
    client_id: flaggedFromIncoming ? incoming.client_id : existing.client_id,
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
