import { AUTH_TOKEN_STORAGE_KEY } from '../auth/token'
import type { ClassRow, LessonRow, ProgressRow, StudentRow, SubjectRow } from '../db'
import {
  deleteRawProgress,
  getRawClass,
  getRawLesson,
  getRawProgressByPair,
  getRawStudent,
  getRawSubject,
  listRowsUpdatedSince,
  putRawClass,
  putRawLesson,
  putRawProgress,
  putRawStudent,
  putRawSubject,
} from '../db/sync'
import { pullChanges, pushChanges, type SyncBatch } from './api'
import { mergeProgressRows } from './mergeProgress'
import { getPullWatermark, getPushWatermark, setPullWatermark, setPushWatermark } from './watermarks'

/**
 * Calls #7's push/pull endpoints and applies the response against the local
 * Dexie store (via src/db/sync.ts's raw accessors). Deliberately has no
 * opinion on *when* to run -- no debounce, no reconnect/foreground
 * listeners, no retry/backoff. That scheduling, plus the sync-status UI, is
 * #21's job; it calls push()/pull() directly once wired up.
 */

// class/subject/lesson/student have no per-field HLC (per #6) -- a plain
// "don't let an older write clobber a newer one" guard on the shared
// updated_at column is the whole conflict story for these tables. progress
// gets the real per-field merge below.
async function applyRemoteClass(incoming: ClassRow): Promise<void> {
  const existing = await getRawClass(incoming.id)
  if (!existing || existing.updated_at < incoming.updated_at) {
    await putRawClass(incoming)
  }
}

async function applyRemoteSubject(incoming: SubjectRow): Promise<void> {
  const existing = await getRawSubject(incoming.id)
  if (!existing || existing.updated_at < incoming.updated_at) {
    await putRawSubject(incoming)
  }
}

async function applyRemoteLesson(incoming: LessonRow): Promise<void> {
  const existing = await getRawLesson(incoming.id)
  if (!existing || existing.updated_at < incoming.updated_at) {
    await putRawLesson(incoming)
  }
}

async function applyRemoteStudent(incoming: StudentRow): Promise<void> {
  const existing = await getRawStudent(incoming.id)
  if (!existing || existing.updated_at < incoming.updated_at) {
    await putRawStudent(incoming)
  }
}

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

async function applyRemoteBatch(batch: SyncBatch): Promise<void> {
  await Promise.all([
    ...batch.classes.map(applyRemoteClass),
    ...batch.subjects.map(applyRemoteSubject),
    ...batch.lessons.map(applyRemoteLesson),
    ...batch.students.map(applyRemoteStudent),
    ...batch.progress.map(applyRemoteProgress),
  ])
}

function isEmptyBatch(batch: SyncBatch): boolean {
  return (
    batch.classes.length === 0 &&
    batch.subjects.length === 0 &&
    batch.lessons.length === 0 &&
    batch.students.length === 0 &&
    batch.progress.length === 0
  )
}

function maxUpdatedAt(rows: { updated_at: string }[], floor: string): string {
  return rows.reduce((max, row) => (row.updated_at > max ? row.updated_at : max), floor)
}

function batchWatermark(batch: SyncBatch, floor: string): string {
  return [batch.classes, batch.subjects, batch.lessons, batch.students, batch.progress].reduce(
    (max, rows) => maxUpdatedAt(rows, max),
    floor,
  )
}

function getToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
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
