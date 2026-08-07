import { AUTH_TOKEN_STORAGE_KEY } from '../auth/token'
import type { ProgressRow, ReviewFlagRow } from '../db'
import {
  clearAllTables,
  deleteRawProgress,
  deleteRawReviewFlag,
  getRawProgressByPair,
  getRawReviewFlagByPair,
  listRowsUpdatedSince,
  putRawClass,
  putRawLesson,
  putRawProgress,
  putRawReviewFlag,
  putRawStudent,
  putRawSubject,
} from '../db/sync'
import { pullChanges, pushChanges, type SyncBatch } from './api'
import { mergeProgressRows } from './mergeProgress'
import { mergeReviewFlagRows } from './mergeReviewFlags'
import { clearWatermarks, getPullWatermark, getPushWatermark, setPullWatermark, setPushWatermark } from './watermarks'

/**
 * Calls #7's push/pull endpoints and applies the response against the local
 * Dexie store (via src/db/sync.ts's raw accessors). Deliberately has no
 * opinion on *when* to run -- no debounce, no reconnect/foreground
 * listeners, no retry/backoff. That scheduling, plus the sync-status UI, is
 * #21's job; it calls push()/pull() directly once wired up.
 */

// A remote progress row's (student_id, subject_id) pair may already exist
// locally under a *different* id -- two devices that each created a row for
// the same cell before ever syncing. Reconciles onto the incoming row's id
// (the one the server/another device already established as canonical),
// merging fields rather than blindly overwriting so a newer not-yet-pushed
// local edit still wins its field. Used identically for both a push
// response's echoed rows and a pull's incoming rows.
async function applyRemoteProgress(incoming: ProgressRow): Promise<void> {
  const existing = await getRawProgressByPair(incoming.student_id, incoming.subject_id)
  if (!existing) {
    await putRawProgress(incoming)
    return
  }

  const merged = mergeProgressRows(existing, incoming)
  if (existing.id !== merged.id) {
    await deleteRawProgress(existing.id)
  }
  await putRawProgress(merged)
}

// #152/ADR-0011: same reconciliation shape as applyRemoteProgress, just
// against review_flag's own (student_id, lesson_id) pair and merge function.
async function applyRemoteReviewFlag(incoming: ReviewFlagRow): Promise<void> {
  const existing = await getRawReviewFlagByPair(incoming.student_id, incoming.lesson_id)
  if (!existing) {
    await putRawReviewFlag(incoming)
    return
  }

  const merged = mergeReviewFlagRows(existing, incoming)
  if (existing.id !== merged.id) {
    await deleteRawReviewFlag(existing.id)
  }
  await putRawReviewFlag(merged)
}

// class/subject/lesson/student have no per-field HLC and no conflict
// resolution at all (per #6/#7) -- same as the server's push handler, this
// is a plain overwrite-by-id, last-received-wins.
async function applyRemoteBatch(batch: SyncBatch): Promise<void> {
  await Promise.all([
    ...batch.classes.map(putRawClass),
    ...batch.subjects.map(putRawSubject),
    ...batch.lessons.map(putRawLesson),
    ...batch.students.map(putRawStudent),
    ...batch.progress.map(applyRemoteProgress),
    ...batch.review_flags.map(applyRemoteReviewFlag),
  ])
}

function isEmptyBatch(batch: SyncBatch): boolean {
  return (
    batch.classes.length === 0 &&
    batch.subjects.length === 0 &&
    batch.lessons.length === 0 &&
    batch.students.length === 0 &&
    batch.progress.length === 0 &&
    batch.review_flags.length === 0
  )
}

function maxUpdatedAt(rows: { updated_at: string }[], floor: string): string {
  return rows.reduce((max, row) => (row.updated_at > max ? row.updated_at : max), floor)
}

function batchWatermark(batch: SyncBatch, floor: string): string {
  return [batch.classes, batch.subjects, batch.lessons, batch.students, batch.progress, batch.review_flags].reduce(
    (max, rows) => maxUpdatedAt(rows, max),
    floor,
  )
}

function getToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
}

/**
 * Wipes the local Dexie tables and both sync watermarks. The local store has
 * no concept of *which* signed-in user its rows belong to (reads scope by
 * user_id -- see #46's "decoy row" fix in db/classes.ts -- but the sync
 * engine's own push path does not), so a previous session's rows are
 * otherwise still sitting there, still "dirty" relative to the old
 * watermark, ready to be swept into the next push and rejected by the
 * server's ownership check with a 403. Call this on every account switch
 * (auth/AuthContext.tsx's login()/loginAsDemo()/logout()) so a new session
 * always starts from a clean local store.
 */
export async function resetLocalStore(): Promise<void> {
  await clearAllTables()
  clearWatermarks()
}

/**
 * Gathers local rows written since the last successful push, sends them,
 * and applies the response's post-merge values back into Dexie -- so this
 * device immediately corrects any field it lost the per-field LWW race on,
 * per #7, instead of waiting for the next pull to find out. No-ops while
 * signed out or when nothing is dirty.
 */
export async function push(): Promise<void> {
  const token = getToken()
  if (token === null) {
    return
  }

  const watermark = getPushWatermark()
  const batch = await listRowsUpdatedSince(watermark)
  if (isEmptyBatch(batch)) {
    return
  }

  const response = await pushChanges(batch, token)
  await applyRemoteBatch(response)

  const floor = watermark ?? ''
  const newWatermark = [batchWatermark(batch, floor), batchWatermark(response, floor)].reduce((a, b) =>
    a > b ? a : b,
  )
  setPushWatermark(newWatermark)
}

/**
 * Pulls rows changed since the last successful pull and applies them into
 * Dexie, then advances the pull watermark to the server's own watermark
 * from the response.
 */
export async function pull(): Promise<void> {
  const token = getToken()
  if (token === null) {
    return
  }

  const since = getPullWatermark()
  const result = await pullChanges(since, token)
  await applyRemoteBatch(result)
  setPullWatermark(result.watermark)
}
