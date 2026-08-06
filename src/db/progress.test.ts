import { afterEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import {
  advanceProgress,
  bulkAdvanceProgress,
  getProgress,
  listProgressForStudents,
  upsertProgressReview,
  upsertProgressStep,
} from './progress'
import { getClientId } from './clientId'
import { createLesson } from './lessons'

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

describe('listProgressForStudents', () => {
  it('returns progress rows for the given students, across subjects', async () => {
    const a = await upsertProgressStep('student-1', 'subject-1', { unit: 1, lesson_in_unit: 1 })
    const b = await upsertProgressStep('student-1', 'subject-2', { unit: 1, lesson_in_unit: 1 })
    await upsertProgressStep('student-2', 'subject-1', { unit: 1, lesson_in_unit: 1 })

    const rows = await listProgressForStudents(['student-1'])

    expect(rows.map((r) => r.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('returns an empty array when no student in the list has any progress', async () => {
    expect(await listProgressForStudents(['student-1'])).toEqual([])
  })

  it('returns an empty array for an empty student list', async () => {
    await upsertProgressStep('student-1', 'subject-1', { unit: 1, lesson_in_unit: 1 })

    expect(await listProgressForStudents([])).toEqual([])
  })
})

describe('advanceProgress', () => {
  function lessonInput(overrides: Partial<Parameters<typeof createLesson>[0]> = {}) {
    return {
      subject_id: 'subject-1',
      unit: 1,
      lesson_in_unit: 1,
      title: 'Untitled lesson',
      description: '',
      ...overrides,
    }
  }

  it('advances a student with no progress row yet to the first lesson in the subject', async () => {
    const first = await createLesson(lessonInput({ title: 'Fractions' }))

    const result = await advanceProgress('student-1', 'subject-1')

    expect(result).toEqual(first)
    const progress = await getProgress('student-1', 'subject-1')
    expect(progress?.step_unit).toBe(1)
    expect(progress?.step_lesson_in_unit).toBe(1)
  })

  it('advances a student to the next lesson after their current step', async () => {
    await createLesson(lessonInput({ title: 'Fractions' }))
    const second = await createLesson(lessonInput({ lesson_in_unit: 2, title: 'Decimals' }))
    await upsertProgressStep('student-1', 'subject-1', { unit: 1, lesson_in_unit: 1 })

    const result = await advanceProgress('student-1', 'subject-1')

    expect(result).toEqual(second)
    const progress = await getProgress('student-1', 'subject-1')
    expect(progress?.step_unit).toBe(1)
    expect(progress?.step_lesson_in_unit).toBe(2)
  })

  it('crosses a unit boundary the same way getNextLessonInSubject does', async () => {
    await createLesson(lessonInput({ lesson_in_unit: 9, title: 'Last of unit 1' }))
    const firstOfUnit2 = await createLesson(lessonInput({ unit: 2, title: 'First of unit 2' }))
    await upsertProgressStep('student-1', 'subject-1', { unit: 1, lesson_in_unit: 9 })

    const result = await advanceProgress('student-1', 'subject-1')

    expect(result).toEqual(firstOfUnit2)
  })

  it('returns undefined and leaves progress untouched when already at the last lesson', async () => {
    await createLesson(lessonInput({ title: 'Only lesson' }))
    const before = await upsertProgressStep('student-1', 'subject-1', { unit: 1, lesson_in_unit: 1 })

    const result = await advanceProgress('student-1', 'subject-1')

    expect(result).toBeUndefined()
    const after = await getProgress('student-1', 'subject-1')
    expect(after).toEqual(before)
  })

  it('does not touch review/review_hlc/review_client_id when advancing', async () => {
    await createLesson(lessonInput({ title: 'Fractions' }))
    await createLesson(lessonInput({ lesson_in_unit: 2, title: 'Decimals' }))
    await upsertProgressStep('student-1', 'subject-1', { unit: 1, lesson_in_unit: 1 })
    await upsertProgressReview('student-1', 'subject-1', true)

    await advanceProgress('student-1', 'subject-1')

    const after = await getProgress('student-1', 'subject-1')
    expect(after?.review).toBe(true)
  })
})

describe('bulkAdvanceProgress', () => {
  function lessonInput(overrides: Partial<Parameters<typeof createLesson>[0]> = {}) {
    return {
      subject_id: 'subject-1',
      unit: 1,
      lesson_in_unit: 1,
      title: 'Untitled lesson',
      description: '',
      ...overrides,
    }
  }

  it('advances every listed student one lesson, including those with no progress row yet', async () => {
    await createLesson(lessonInput({ title: 'Fractions' }))
    const second = await createLesson(lessonInput({ lesson_in_unit: 2, title: 'Decimals' }))
    await upsertProgressStep('student-1', 'subject-1', { unit: 1, lesson_in_unit: 1 })

    await bulkAdvanceProgress('subject-1', ['student-1', 'student-2'])

    const p1 = await getProgress('student-1', 'subject-1')
    expect(p1?.step_unit).toBe(second.unit)
    expect(p1?.step_lesson_in_unit).toBe(second.lesson_in_unit)

    const p2 = await getProgress('student-2', 'subject-1')
    expect(p2?.step_unit).toBe(1)
    expect(p2?.step_lesson_in_unit).toBe(1)
  })

  it('silently skips a student already on the subject\'s last lesson', async () => {
    await createLesson(lessonInput({ title: 'Only lesson' }))
    const before = await upsertProgressStep('student-1', 'subject-1', { unit: 1, lesson_in_unit: 1 })
    await upsertProgressStep('student-2', 'subject-1', { unit: 0, lesson_in_unit: 0 })

    const records = await bulkAdvanceProgress('subject-1', ['student-1', 'student-2'])

    expect(records.map((r) => r.studentId)).toEqual(['student-2'])
    const after1 = await getProgress('student-1', 'subject-1')
    expect(after1).toEqual(before)
  })

  it('silently skips every student when the subject has no lessons', async () => {
    const records = await bulkAdvanceProgress('subject-1', ['student-1', 'student-2'])

    expect(records).toEqual([])
    expect(await getProgress('student-1', 'subject-1')).toBeUndefined()
  })

  it('returns an empty array for an empty student list', async () => {
    await createLesson(lessonInput())

    expect(await bulkAdvanceProgress('subject-1', [])).toEqual([])
  })

  it('returns a record per advanced student carrying their pre-batch step, for Undo', async () => {
    await createLesson(lessonInput({ title: 'Fractions' }))
    await createLesson(lessonInput({ lesson_in_unit: 2, title: 'Decimals' }))
    await upsertProgressStep('student-1', 'subject-1', { unit: 1, lesson_in_unit: 1 })

    const records = await bulkAdvanceProgress('subject-1', ['student-1', 'student-2'])

    expect(records).toEqual(
      expect.arrayContaining([
        { studentId: 'student-1', previousStep: { unit: 1, lesson_in_unit: 1 } },
        { studentId: 'student-2', previousStep: { unit: 0, lesson_in_unit: 0 } },
      ]),
    )
  })

  it('does not touch review/review_hlc/review_client_id when bulk advancing', async () => {
    await createLesson(lessonInput({ title: 'Fractions' }))
    await createLesson(lessonInput({ lesson_in_unit: 2, title: 'Decimals' }))
    await upsertProgressStep('student-1', 'subject-1', { unit: 1, lesson_in_unit: 1 })
    await upsertProgressReview('student-1', 'subject-1', true)

    await bulkAdvanceProgress('subject-1', ['student-1'])

    const after = await getProgress('student-1', 'subject-1')
    expect(after?.review).toBe(true)
  })

  it('only advances students in the given subject, leaving other subjects\' progress untouched', async () => {
    await createLesson(lessonInput({ title: 'Fractions' }))
    await createLesson({ ...lessonInput(), subject_id: 'subject-2', title: 'Other subject lesson' })
    const otherBefore = await upsertProgressStep('student-1', 'subject-2', { unit: 0, lesson_in_unit: 0 })

    await bulkAdvanceProgress('subject-1', ['student-1'])

    const otherAfter = await getProgress('student-1', 'subject-2')
    expect(otherAfter).toEqual(otherBefore)
  })
})
