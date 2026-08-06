import { afterEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import {
  createLesson,
  deleteLesson,
  findNextLesson,
  findPreviousLesson,
  formatLessonLabel,
  getLessonByPosition,
  getNextLessonInSubject,
  getNextLessonPosition,
  getPreviousLessonInSubject,
  getSuggestedNewLessonPosition,
  listLessonsForSubject,
  listLessonsForSubjects,
  updateLessonContent,
} from './lessons'

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

describe('getNextLessonInSubject', () => {
  it('returns the lesson with the smallest (unit, lesson_in_unit) tuple greater than the given step', async () => {
    await createLesson(lessonInput({ unit: 1, lesson_in_unit: 1 }))
    const current = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 2 }))
    const next = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 3 }))
    await createLesson(lessonInput({ unit: 2, lesson_in_unit: 1 }))

    const found = await getNextLessonInSubject('subject-1', {
      unit: current.unit,
      lesson_in_unit: current.lesson_in_unit,
    })

    expect(found).toEqual(next)
  })

  it('crosses from a unit\'s last lesson into the next unit\'s first lesson with no special-casing', async () => {
    const lastOfUnit1 = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 9 }))
    const firstOfUnit2 = await createLesson(lessonInput({ unit: 2, lesson_in_unit: 1 }))

    const found = await getNextLessonInSubject('subject-1', {
      unit: lastOfUnit1.unit,
      lesson_in_unit: lastOfUnit1.lesson_in_unit,
    })

    expect(found).toEqual(firstOfUnit2)
  })

  it('returns undefined when the given step is the last lesson in the subject', async () => {
    const last = await createLesson(lessonInput({ unit: 3, lesson_in_unit: 1 }))

    const found = await getNextLessonInSubject('subject-1', {
      unit: last.unit,
      lesson_in_unit: last.lesson_in_unit,
    })

    expect(found).toBeUndefined()
  })

  it('returns undefined when the subject has no lessons at all', async () => {
    expect(await getNextLessonInSubject('subject-1', { unit: 0, lesson_in_unit: 0 })).toBeUndefined()
  })

  it('treats {0, 0} (no progress yet) as before every real lesson', async () => {
    const first = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 1 }))

    const found = await getNextLessonInSubject('subject-1', { unit: 0, lesson_in_unit: 0 })

    expect(found).toEqual(first)
  })

  it('skips a soft-deleted lesson', async () => {
    const current = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 1 }))
    const deleted = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 2 }))
    await deleteLesson(deleted.id)
    const nextLive = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 3 }))

    const found = await getNextLessonInSubject('subject-1', {
      unit: current.unit,
      lesson_in_unit: current.lesson_in_unit,
    })

    expect(found).toEqual(nextLive)
  })

  it('scopes to the given subject, ignoring lessons in other subjects', async () => {
    await createLesson(lessonInput({ subject_id: 'subject-2', unit: 1, lesson_in_unit: 1 }))

    const found = await getNextLessonInSubject('subject-1', { unit: 0, lesson_in_unit: 0 })

    expect(found).toBeUndefined()
  })
})

describe('getPreviousLessonInSubject', () => {
  it('returns the lesson with the largest (unit, lesson_in_unit) tuple less than the given step', async () => {
    const previous = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 1 }))
    const current = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 2 }))
    await createLesson(lessonInput({ unit: 1, lesson_in_unit: 3 }))
    await createLesson(lessonInput({ unit: 2, lesson_in_unit: 1 }))

    const found = await getPreviousLessonInSubject('subject-1', {
      unit: current.unit,
      lesson_in_unit: current.lesson_in_unit,
    })

    expect(found).toEqual(previous)
  })

  it('crosses from a unit\'s first lesson back into the previous unit\'s last lesson with no special-casing', async () => {
    const lastOfUnit1 = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 9 }))
    const firstOfUnit2 = await createLesson(lessonInput({ unit: 2, lesson_in_unit: 1 }))

    const found = await getPreviousLessonInSubject('subject-1', {
      unit: firstOfUnit2.unit,
      lesson_in_unit: firstOfUnit2.lesson_in_unit,
    })

    expect(found).toEqual(lastOfUnit1)
  })

  it('returns undefined when the given step is the first lesson in the subject', async () => {
    const first = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 1 }))

    const found = await getPreviousLessonInSubject('subject-1', {
      unit: first.unit,
      lesson_in_unit: first.lesson_in_unit,
    })

    expect(found).toBeUndefined()
  })

  it('returns undefined when the subject has no lessons at all', async () => {
    expect(await getPreviousLessonInSubject('subject-1', { unit: 1, lesson_in_unit: 1 })).toBeUndefined()
  })

  it('returns undefined for {0, 0} (before every real lesson)', async () => {
    await createLesson(lessonInput({ unit: 1, lesson_in_unit: 1 }))

    const found = await getPreviousLessonInSubject('subject-1', { unit: 0, lesson_in_unit: 0 })

    expect(found).toBeUndefined()
  })

  it('skips a soft-deleted lesson', async () => {
    const previousLive = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 1 }))
    const deleted = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 2 }))
    await deleteLesson(deleted.id)
    const current = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 3 }))

    const found = await getPreviousLessonInSubject('subject-1', {
      unit: current.unit,
      lesson_in_unit: current.lesson_in_unit,
    })

    expect(found).toEqual(previousLive)
  })

  it('scopes to the given subject, ignoring lessons in other subjects', async () => {
    await createLesson(lessonInput({ subject_id: 'subject-2', unit: 1, lesson_in_unit: 1 }))

    const found = await getPreviousLessonInSubject('subject-1', { unit: 5, lesson_in_unit: 1 })

    expect(found).toBeUndefined()
  })
})

describe('listLessonsForSubjects', () => {
  it('returns lessons across the given subjects, sorted per subject-then-position', async () => {
    const a = await createLesson(lessonInput({ subject_id: 'subject-1', unit: 1, lesson_in_unit: 1 }))
    const b = await createLesson(lessonInput({ subject_id: 'subject-2', unit: 1, lesson_in_unit: 1 }))
    await createLesson(lessonInput({ subject_id: 'subject-3', unit: 1, lesson_in_unit: 1 }))

    const rows = await listLessonsForSubjects(['subject-1', 'subject-2'])

    expect(rows.map((r) => r.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('excludes soft-deleted rows', async () => {
    const kept = await createLesson(lessonInput({ subject_id: 'subject-1' }))
    const removed = await createLesson(lessonInput({ subject_id: 'subject-1', lesson_in_unit: 2 }))
    await deleteLesson(removed.id)

    const rows = await listLessonsForSubjects(['subject-1'])

    expect(rows.map((r) => r.id)).toEqual([kept.id])
  })

  it('returns an empty array for an empty subject list', async () => {
    await createLesson(lessonInput())

    expect(await listLessonsForSubjects([])).toEqual([])
  })
})

describe('findNextLesson', () => {
  it('finds the smallest (unit, lesson_in_unit) tuple greater than the given step, scoped to one subject', async () => {
    const own = await createLesson(lessonInput({ subject_id: 'subject-1', unit: 1, lesson_in_unit: 2 }))
    await createLesson(lessonInput({ subject_id: 'subject-2', unit: 1, lesson_in_unit: 1 }))
    const all = await listLessonsForSubjects(['subject-1', 'subject-2'])

    const found = findNextLesson(all, 'subject-1', { unit: 0, lesson_in_unit: 0 })

    expect(found).toEqual(own)
  })

  it('does not cross into another subject even when its lessons sort earlier', async () => {
    await createLesson(lessonInput({ subject_id: 'subject-2', unit: 1, lesson_in_unit: 1 }))
    const all = await listLessonsForSubjects(['subject-1', 'subject-2'])

    const found = findNextLesson(all, 'subject-1', { unit: 0, lesson_in_unit: 0 })

    expect(found).toBeUndefined()
  })
})

describe('findPreviousLesson', () => {
  it('finds the largest (unit, lesson_in_unit) tuple less than the given step, scoped to one subject', async () => {
    const own = await createLesson(lessonInput({ subject_id: 'subject-1', unit: 1, lesson_in_unit: 2 }))
    await createLesson(lessonInput({ subject_id: 'subject-2', unit: 1, lesson_in_unit: 5 }))
    const all = await listLessonsForSubjects(['subject-1', 'subject-2'])

    const found = findPreviousLesson(all, 'subject-1', { unit: 5, lesson_in_unit: 1 })

    expect(found).toEqual(own)
  })

  it('does not cross into another subject even when its lessons sort later', async () => {
    await createLesson(lessonInput({ subject_id: 'subject-2', unit: 9, lesson_in_unit: 1 }))
    const all = await listLessonsForSubjects(['subject-1', 'subject-2'])

    const found = findPreviousLesson(all, 'subject-1', { unit: 5, lesson_in_unit: 1 })

    expect(found).toBeUndefined()
  })
})

describe('getNextLessonPosition', () => {
  it('suggests one more than the highest lesson_in_unit already used in the requested unit', async () => {
    await createLesson(lessonInput({ unit: 2, lesson_in_unit: 1 }))
    await createLesson(lessonInput({ unit: 2, lesson_in_unit: 2 }))
    const all = await listLessonsForSubject('subject-1')

    const suggestion = getNextLessonPosition(all, 'subject-1', 2)

    expect(suggestion).toEqual({ unit: 2, lesson_in_unit: 3 })
  })

  it('suggests lesson_in_unit 1 for a unit with no lessons yet', async () => {
    await createLesson(lessonInput({ unit: 1, lesson_in_unit: 1 }))
    const all = await listLessonsForSubject('subject-1')

    const suggestion = getNextLessonPosition(all, 'subject-1', 3)

    expect(suggestion).toEqual({ unit: 3, lesson_in_unit: 1 })
  })

  it('only counts lessons in the requested unit, ignoring other units', async () => {
    await createLesson(lessonInput({ unit: 1, lesson_in_unit: 1 }))
    await createLesson(lessonInput({ unit: 1, lesson_in_unit: 9 }))
    await createLesson(lessonInput({ unit: 2, lesson_in_unit: 1 }))
    const all = await listLessonsForSubject('subject-1')

    const suggestion = getNextLessonPosition(all, 'subject-1', 2)

    expect(suggestion).toEqual({ unit: 2, lesson_in_unit: 2 })
  })

  it('ignores a soft-deleted lesson when computing the max', async () => {
    await createLesson(lessonInput({ unit: 1, lesson_in_unit: 1 }))
    const deleted = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 2 }))
    await deleteLesson(deleted.id)
    const all = await db.lesson.where('subject_id').equals('subject-1').toArray()

    const suggestion = getNextLessonPosition(all, 'subject-1', 1)

    expect(suggestion).toEqual({ unit: 1, lesson_in_unit: 2 })
  })

  it('scopes to the given subject, ignoring lessons in other subjects', async () => {
    await createLesson(lessonInput({ subject_id: 'subject-2', unit: 1, lesson_in_unit: 5 }))
    const all = await listLessonsForSubjects(['subject-1', 'subject-2'])

    const suggestion = getNextLessonPosition(all, 'subject-1', 1)

    expect(suggestion).toEqual({ unit: 1, lesson_in_unit: 1 })
  })
})

describe('getSuggestedNewLessonPosition', () => {
  it('suggests the last-used unit paired with its next available lesson number', async () => {
    await createLesson(lessonInput({ unit: 1, lesson_in_unit: 1 }))
    await createLesson(lessonInput({ unit: 2, lesson_in_unit: 1 }))
    await createLesson(lessonInput({ unit: 2, lesson_in_unit: 2 }))
    const all = await listLessonsForSubject('subject-1')

    const suggestion = getSuggestedNewLessonPosition(all, 'subject-1')

    expect(suggestion).toEqual({ unit: 2, lesson_in_unit: 3 })
  })

  it('suggests Unit 1, Lesson 1 for a subject with no lessons yet', async () => {
    const suggestion = getSuggestedNewLessonPosition([], 'subject-1')

    expect(suggestion).toEqual({ unit: 1, lesson_in_unit: 1 })
  })

  it('ignores a soft-deleted lesson in the highest-unit subject', async () => {
    await createLesson(lessonInput({ unit: 1, lesson_in_unit: 1 }))
    const deleted = await createLesson(lessonInput({ unit: 2, lesson_in_unit: 1 }))
    await deleteLesson(deleted.id)
    const all = await db.lesson.where('subject_id').equals('subject-1').toArray()

    const suggestion = getSuggestedNewLessonPosition(all, 'subject-1')

    expect(suggestion).toEqual({ unit: 1, lesson_in_unit: 2 })
  })

  it('scopes to the given subject, ignoring lessons in other subjects', async () => {
    await createLesson(lessonInput({ subject_id: 'subject-2', unit: 5, lesson_in_unit: 1 }))
    await createLesson(lessonInput({ subject_id: 'subject-1', unit: 1, lesson_in_unit: 1 }))
    const all = await listLessonsForSubjects(['subject-1', 'subject-2'])

    const suggestion = getSuggestedNewLessonPosition(all, 'subject-1')

    expect(suggestion).toEqual({ unit: 1, lesson_in_unit: 2 })
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

describe('updateLessonContent', () => {
  it('updates title and description, keeping the same unit/lesson_in_unit', async () => {
    const created = await createLesson(lessonInput())

    await updateLessonContent(created.id, {
      unit: created.unit,
      lesson_in_unit: created.lesson_in_unit,
      title: 'Adding fractions',
      description: 'Common denominators',
    })

    const raw = await db.lesson.get(created.id)
    expect(raw?.title).toBe('Adding fractions')
    expect(raw?.description).toBe('Common denominators')
    expect(raw?.unit).toBe(created.unit)
    expect(raw?.lesson_in_unit).toBe(created.lesson_in_unit)
    expect(raw?.subject_id).toBe(created.subject_id)
  })

  it('updates unit and lesson_in_unit along with title/description in one write', async () => {
    const created = await createLesson(lessonInput({ unit: 1, lesson_in_unit: 1 }))

    await updateLessonContent(created.id, {
      unit: 2,
      lesson_in_unit: 3,
      title: 'Adding fractions',
      description: 'Common denominators',
    })

    const raw = await db.lesson.get(created.id)
    expect(raw?.unit).toBe(2)
    expect(raw?.lesson_in_unit).toBe(3)
    expect(raw?.title).toBe('Adding fractions')
    expect(raw?.description).toBe('Common denominators')
  })

  it('leaves the id unchanged by an edit', async () => {
    const created = await createLesson(lessonInput())

    await updateLessonContent(created.id, {
      unit: 5,
      lesson_in_unit: 5,
      title: 'New title',
      description: '',
    })

    const raw = await db.lesson.get(created.id)
    expect(raw?.id).toBe(created.id)
  })
})

describe('formatLessonLabel', () => {
  it('renders as "<unit>.<lesson_in_unit> - <title>"', () => {
    const label = formatLessonLabel({
      id: 'l1',
      subject_id: 'subject-1',
      unit: 1,
      lesson_in_unit: 1,
      title: 'Practicing addition',
      description: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    })

    expect(label).toBe('1.1 - Practicing addition')
  })
})
