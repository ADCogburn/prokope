import { afterEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import { getProgress, upsertProgressReview, upsertProgressStep } from './progress'
import { getClientId } from './clientId'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('getProgress', () => {
  it('returns undefined when no row exists for the (student, subject) pair', async () => {
    expect(await getProgress('student-1', 'subject-1')).toBeUndefined()
  })
})

describe('upsertProgressStep', () => {
  it('creates a row with a UUID primary key, stamping step_hlc/step_client_id', async () => {
    const row = await upsertProgressStep('student-1', 'subject-1', { unit: 1, lesson_in_unit: 2 })

    expect(row.id).toMatch(UUID_PATTERN)
    expect(row.step_unit).toBe(1)
    expect(row.step_lesson_in_unit).toBe(2)
    expect(row.step_client_id).toBe(getClientId())
    expect(row.step_hlc).toBeTruthy()
  })

  it('on first creation, defaults review to false and stamps review_hlc/review_client_id with this same write (required non-nullable columns)', async () => {
    const row = await upsertProgressStep('student-1', 'subject-1', { unit: 1, lesson_in_unit: 2 })

    expect(row.review).toBe(false)
    expect(row.review_hlc).toBe(row.step_hlc)
    expect(row.review_client_id).toBe(row.step_client_id)
  })

  it('updates step in place on a second write, leaving review/review_hlc/review_client_id untouched', async () => {
    const created = await upsertProgressStep('student-1', 'subject-1', { unit: 1, lesson_in_unit: 1 })
    await upsertProgressReview('student-1', 'subject-1', true)

    const afterReview = await getProgress('student-1', 'subject-1')
    const updated = await upsertProgressStep('student-1', 'subject-1', { unit: 2, lesson_in_unit: 1 })

    expect(updated.id).toBe(created.id)
    expect(updated.step_unit).toBe(2)
    expect(updated.review).toBe(afterReview?.review)
    expect(updated.review_hlc).toBe(afterReview?.review_hlc)
    expect(updated.review_client_id).toBe(afterReview?.review_client_id)
  })

  it('produces monotonically non-decreasing HLC values across sequential writes', async () => {
    const first = await upsertProgressStep('student-1', 'subject-1', { unit: 1, lesson_in_unit: 1 })
    const second = await upsertProgressStep('student-1', 'subject-1', { unit: 1, lesson_in_unit: 2 })

    expect(second.step_hlc >= first.step_hlc).toBe(true)
    expect(second.step_hlc).not.toBe(first.step_hlc)
  })

  it('updates in place rather than creating a second row for the same (student, subject) pair', async () => {
    await upsertProgressStep('student-1', 'subject-1', { unit: 1, lesson_in_unit: 1 })
    await upsertProgressStep('student-1', 'subject-1', { unit: 1, lesson_in_unit: 2 })

    const rows = await db.progress
      .where('[student_id+subject_id]')
      .equals(['student-1', 'subject-1'])
      .toArray()
    expect(rows).toHaveLength(1)
  })
})

describe('upsertProgressReview', () => {
  it('creates a row with a UUID primary key, stamping review_hlc/review_client_id', async () => {
    const row = await upsertProgressReview('student-1', 'subject-1', true)

    expect(row.id).toMatch(UUID_PATTERN)
    expect(row.review).toBe(true)
    expect(row.review_client_id).toBe(getClientId())
    expect(row.review_hlc).toBeTruthy()
  })

  it('on first creation, defaults step to {0, 0} and stamps step_hlc/step_client_id with this same write (required non-nullable columns)', async () => {
    const row = await upsertProgressReview('student-1', 'subject-1', true)

    expect(row.step_unit).toBe(0)
    expect(row.step_lesson_in_unit).toBe(0)
    expect(row.step_hlc).toBe(row.review_hlc)
    expect(row.step_client_id).toBe(row.review_client_id)
  })

  it('updates review in place on a second write, leaving step/step_hlc/step_client_id untouched', async () => {
    const created = await upsertProgressStep('student-1', 'subject-1', { unit: 3, lesson_in_unit: 4 })

    const updated = await upsertProgressReview('student-1', 'subject-1', true)

    expect(updated.id).toBe(created.id)
    expect(updated.review).toBe(true)
    expect(updated.step_unit).toBe(created.step_unit)
    expect(updated.step_lesson_in_unit).toBe(created.step_lesson_in_unit)
    expect(updated.step_hlc).toBe(created.step_hlc)
    expect(updated.step_client_id).toBe(created.step_client_id)
  })

  it('updates in place rather than creating a second row for the same (student, subject) pair', async () => {
    await upsertProgressReview('student-1', 'subject-1', false)
    await upsertProgressReview('student-1', 'subject-1', true)

    const rows = await db.progress
      .where('[student_id+subject_id]')
      .equals(['student-1', 'subject-1'])
      .toArray()
    expect(rows).toHaveLength(1)
  })
})
