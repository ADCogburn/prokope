import { afterEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import { getReviewFlag, listReviewFlagsForStudents, upsertReviewFlag } from './reviewFlags'
import { getClientId } from './clientId'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('getReviewFlag', () => {
  it('returns undefined when no row exists for the (student, lesson) pair', async () => {
    expect(await getReviewFlag('student-1', 'lesson-1')).toBeUndefined()
  })
})

describe('upsertReviewFlag', () => {
  it('creates a row with a UUID primary key, stamping hlc/client_id', async () => {
    const row = await upsertReviewFlag('student-1', 'lesson-1', true)

    expect(row.id).toMatch(UUID_PATTERN)
    expect(row.student_id).toBe('student-1')
    expect(row.lesson_id).toBe('lesson-1')
    expect(row.flagged).toBe(true)
    expect(row.client_id).toBe(getClientId())
    expect(row.hlc).toBeTruthy()
  })

  it('updates flagged in place on a second write, stamping a fresh hlc', async () => {
    const created = await upsertReviewFlag('student-1', 'lesson-1', true)
    const updated = await upsertReviewFlag('student-1', 'lesson-1', false)

    expect(updated.id).toBe(created.id)
    expect(updated.flagged).toBe(false)
    expect(updated.hlc >= created.hlc).toBe(true)
  })

  it('updates in place rather than creating a second row for the same (student, lesson) pair', async () => {
    await upsertReviewFlag('student-1', 'lesson-1', false)
    await upsertReviewFlag('student-1', 'lesson-1', true)

    const rows = await db.review_flag
      .where('[student_id+lesson_id]')
      .equals(['student-1', 'lesson-1'])
      .toArray()
    expect(rows).toHaveLength(1)
  })

  it('produces monotonically non-decreasing HLC values across sequential writes', async () => {
    const first = await upsertReviewFlag('student-1', 'lesson-1', true)
    const second = await upsertReviewFlag('student-1', 'lesson-1', false)

    expect(second.hlc >= first.hlc).toBe(true)
    expect(second.hlc).not.toBe(first.hlc)
  })

  it('keeps flags for different lessons independent, even for the same student', async () => {
    await upsertReviewFlag('student-1', 'lesson-1', true)
    await upsertReviewFlag('student-1', 'lesson-2', false)

    expect((await getReviewFlag('student-1', 'lesson-1'))?.flagged).toBe(true)
    expect((await getReviewFlag('student-1', 'lesson-2'))?.flagged).toBe(false)
  })
})

describe('listReviewFlagsForStudents', () => {
  it('returns review-flag rows for the given students, across lessons', async () => {
    const a = await upsertReviewFlag('student-1', 'lesson-1', true)
    const b = await upsertReviewFlag('student-1', 'lesson-2', true)
    await upsertReviewFlag('student-2', 'lesson-1', true)

    const rows = await listReviewFlagsForStudents(['student-1'])

    expect(rows.map((r) => r.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('returns an empty array when no student in the list has any review flag', async () => {
    expect(await listReviewFlagsForStudents(['student-1'])).toEqual([])
  })

  it('returns an empty array for an empty student list', async () => {
    await upsertReviewFlag('student-1', 'lesson-1', true)

    expect(await listReviewFlagsForStudents([])).toEqual([])
  })
})
