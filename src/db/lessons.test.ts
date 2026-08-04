import { afterEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import { createLesson, deleteLesson, getLessonByPosition, listLessonsForSubject } from './lessons'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

function lessonInput(overrides: Partial<Parameters<typeof createLesson>[0]> = {}) {
  return {
    subject_id: 'subject-1',
    unit: 1,
    lesson_in_unit: 1,
    title: 'Fractions',
    description: 'Intro to fractions',
    ...overrides,
  }
}

describe('createLesson', () => {
  it('generates a client-side UUID primary key', async () => {
    const row = await createLesson(lessonInput())

    expect(row.id).toMatch(UUID_PATTERN)
  })

  it('rejects a second lesson at the same subject/unit/lesson_in_unit', async () => {
    await createLesson(lessonInput())

    await expect(createLesson(lessonInput({ title: 'Different title' }))).rejects.toThrow()
  })
})

describe('listLessonsForSubject', () => {
  it('sorts by unit then lesson_in_unit, avoiding string/float ordering bugs', async () => {
    const u2 = await createLesson(lessonInput({ unit: 2, lesson_in_unit: 1 }))
    const u1l10 = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 10 }))
    const u1l2 = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 2 }))

    const rows = await listLessonsForSubject('subject-1')

    expect(rows.map((r) => r.id)).toEqual([u1l2.id, u1l10.id, u2.id])
  })

  it('excludes soft-deleted rows by default', async () => {
    const kept = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 1 }))
    const removed = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 2 }))
    await deleteLesson(removed.id)

    const rows = await listLessonsForSubject('subject-1')

    expect(rows.map((r) => r.id)).toEqual([kept.id])
  })
})

describe('getLessonByPosition', () => {
  it('finds a lesson by its structured {unit, lesson_in_unit} key', async () => {
    const created = await createLesson(lessonInput({ unit: 3, lesson_in_unit: 4 }))

    const found = await getLessonByPosition('subject-1', 3, 4)

    expect(found).toEqual(created)
  })

  it('returns undefined for a soft-deleted lesson', async () => {
    const created = await createLesson(lessonInput({ unit: 3, lesson_in_unit: 4 }))
    await deleteLesson(created.id)

    expect(await getLessonByPosition('subject-1', 3, 4)).toBeUndefined()
  })

  it('returns undefined when no lesson matches', async () => {
    expect(await getLessonByPosition('subject-1', 9, 9)).toBeUndefined()
  })
})

describe('deleteLesson', () => {
  it('sets deleted_at without removing the row', async () => {
    const created = await createLesson(lessonInput())

    await deleteLesson(created.id)

    const raw = await db.lesson.get(created.id)
    expect(raw).toBeDefined()
    expect(raw?.deleted_at).not.toBeNull()
  })
})
