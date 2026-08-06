import { describe, expect, it } from 'vitest'
import type { LessonRow } from '../db/schema'
import { groupLessonsByUnit } from './groupLessonsByUnit'

function lessonRow(overrides: Partial<LessonRow> = {}): LessonRow {
  return {
    id: 'lesson1',
    subject_id: 'subj1',
    unit: 1,
    lesson_in_unit: 1,
    title: 'Fractions',
    description: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  }
}

describe('groupLessonsByUnit', () => {
  it('returns an empty array for an empty lesson list', () => {
    expect(groupLessonsByUnit([])).toEqual([])
  })

  it('groups a single unit\'s lessons into one group, preserving lesson order', () => {
    const l1 = lessonRow({ id: 'l1', unit: 1, lesson_in_unit: 1, title: 'Fractions' })
    const l2 = lessonRow({ id: 'l2', unit: 1, lesson_in_unit: 2, title: 'Decimals' })

    const groups = groupLessonsByUnit([l1, l2])

    expect(groups).toEqual([{ unit: 1, lessons: [l1, l2] }])
  })

  it('produces one group per unit, in the order units first appear', () => {
    const l1 = lessonRow({ id: 'l1', unit: 1, lesson_in_unit: 1 })
    const l2 = lessonRow({ id: 'l2', unit: 1, lesson_in_unit: 2 })
    const l3 = lessonRow({ id: 'l3', unit: 2, lesson_in_unit: 1 })
    const l4 = lessonRow({ id: 'l4', unit: 3, lesson_in_unit: 1 })

    const groups = groupLessonsByUnit([l1, l2, l3, l4])

    expect(groups).toEqual([
      { unit: 1, lessons: [l1, l2] },
      { unit: 2, lessons: [l3] },
      { unit: 3, lessons: [l4] },
    ])
  })

  it('gives a unit with exactly one lesson a group of length one', () => {
    const l1 = lessonRow({ id: 'l1', unit: 5, lesson_in_unit: 1 })

    const groups = groupLessonsByUnit([l1])

    expect(groups).toEqual([{ unit: 5, lessons: [l1] }])
  })
})
