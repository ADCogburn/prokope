import { afterEach, describe, expect, it } from 'vitest'
import { db, type ClassRow, type ProgressRow, type ReviewFlagRow } from './schema'
import {
  listRowsUpdatedSince,
  getRawClass,
  putRawClass,
  getRawProgressByPair,
  putRawProgress,
  deleteRawProgress,
  getRawReviewFlagByPair,
  putRawReviewFlag,
  deleteRawReviewFlag,
} from './sync'
import { createClass, deleteClass } from './classes'

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

function makeClass(overrides: Partial<ClassRow> = {}): ClassRow {
  return {
    id: crypto.randomUUID(),
    user_id: 'user-1',
    name: 'Room 5',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

function makeProgress(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    id: crypto.randomUUID(),
    student_id: 'student-1',
    subject_id: 'subject-1',
    step_unit: 1,
    step_lesson_in_unit: 1,
    step_hlc: 'hlc-1',
    step_client_id: 'client-1',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeReviewFlag(overrides: Partial<ReviewFlagRow> = {}): ReviewFlagRow {
  return {
    id: crypto.randomUUID(),
    student_id: 'student-1',
    lesson_id: 'lesson-1',
    flagged: true,
    hlc: 'hlc-1',
    client_id: 'client-1',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('listRowsUpdatedSince', () => {
  it('returns every row across all tables when since is null', async () => {
    await putRawClass(makeClass())
    await putRawProgress(makeProgress())

    const snapshot = await listRowsUpdatedSince(null)

    expect(snapshot.classes).toHaveLength(1)
    expect(snapshot.progress).toHaveLength(1)
  })

  it('excludes rows at or before the watermark and includes rows after it', async () => {
    await putRawClass(makeClass({ id: 'old', updated_at: '2024-01-01T00:00:00.000Z' }))
    await putRawClass(makeClass({ id: 'new', updated_at: '2024-06-01T00:00:00.000Z' }))

    const snapshot = await listRowsUpdatedSince('2024-03-01T00:00:00.000Z')

    expect(snapshot.classes.map((c) => c.id)).toEqual(['new'])
  })

  it('includes soft-deleted rows, unlike the entity modules default reads', async () => {
    const created = await createClass({ user_id: 'user-1', name: 'Room 5' })
    await deleteClass(created.id)

    const snapshot = await listRowsUpdatedSince(null)

    expect(snapshot.classes.find((c) => c.id === created.id)?.deleted_at).not.toBeNull()
  })
})

describe('raw accessors', () => {
  it('getRawClass returns a soft-deleted row that getClass would filter out', async () => {
    const created = await createClass({ user_id: 'user-1', name: 'Room 5' })
    await deleteClass(created.id)

    const raw = await getRawClass(created.id)

    expect(raw).toBeDefined()
    expect(raw?.deleted_at).not.toBeNull()
  })

  it('getRawProgressByPair finds a row by (student_id, subject_id)', async () => {
    const row = makeProgress({ student_id: 'student-9', subject_id: 'subject-9' })
    await putRawProgress(row)

    const found = await getRawProgressByPair('student-9', 'subject-9')

    expect(found?.id).toBe(row.id)
  })

  it('deleteRawProgress removes the row entirely (no tombstone)', async () => {
    const row = makeProgress()
    await putRawProgress(row)

    await deleteRawProgress(row.id)

    expect(await db.progress.get(row.id)).toBeUndefined()
  })

  it('getRawReviewFlagByPair finds a row by (student_id, lesson_id)', async () => {
    const row = makeReviewFlag({ student_id: 'student-9', lesson_id: 'lesson-9' })
    await putRawReviewFlag(row)

    const found = await getRawReviewFlagByPair('student-9', 'lesson-9')

    expect(found?.id).toBe(row.id)
  })

  it('deleteRawReviewFlag removes the row entirely (no tombstone)', async () => {
    const row = makeReviewFlag()
    await putRawReviewFlag(row)

    await deleteRawReviewFlag(row.id)

    expect(await db.review_flag.get(row.id)).toBeUndefined()
  })
})
