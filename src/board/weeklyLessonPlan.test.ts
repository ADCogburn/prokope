import { describe, expect, it } from 'vitest'
import type { LessonRow, ProgressRow, SubjectRow } from '../db/schema'
import {
  buildWeeklyLessonPlan,
  formatDayHeader,
  getUpcomingWeekDates,
  ordinalOfStep,
  projectSubjectWeek,
} from './weeklyLessonPlan'

function lessonRow(overrides: Partial<LessonRow> = {}): LessonRow {
  return {
    id: 'lesson1',
    subject_id: 'subj1',
    unit: 1,
    lesson_in_unit: 1,
    title: 'Lesson title',
    description: 'Lesson description',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  }
}

function progressRow(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    id: 'progress1',
    student_id: 'student1',
    subject_id: 'subj1',
    step_unit: 0,
    step_lesson_in_unit: 0,
    step_hlc: '',
    step_client_id: '',
    review: false,
    review_hlc: '',
    review_client_id: '',
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function subjectRow(overrides: Partial<SubjectRow> = {}): SubjectRow {
  return {
    id: 'subj1',
    class_id: 'class1',
    name: 'Math',
    position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  }
}

describe('getUpcomingWeekDates', () => {
  it('returns the same Monday through Friday when the reference date is already a Monday', () => {
    const monday = new Date(2024, 0, 1) // 2024-01-01 is a Monday
    const [mon, tue, wed, thu, fri] = getUpcomingWeekDates(monday)

    expect(mon).toEqual(new Date(2024, 0, 1))
    expect(tue).toEqual(new Date(2024, 0, 2))
    expect(wed).toEqual(new Date(2024, 0, 3))
    expect(thu).toEqual(new Date(2024, 0, 4))
    expect(fri).toEqual(new Date(2024, 0, 5))
  })

  it('rolls a mid-week reference date forward to the coming Monday', () => {
    const wednesday = new Date(2024, 0, 3) // Wednesday

    const [mon] = getUpcomingWeekDates(wednesday)

    expect(mon).toEqual(new Date(2024, 0, 8)) // next Monday
  })

  it('rolls a Sunday reference date forward to the very next day', () => {
    const sunday = new Date(2024, 0, 7)

    const [mon] = getUpcomingWeekDates(sunday)

    expect(mon).toEqual(new Date(2024, 0, 8))
  })

  it('rolls a Saturday reference date forward two days to Monday', () => {
    const saturday = new Date(2024, 0, 6)

    const [mon] = getUpcomingWeekDates(saturday)

    expect(mon).toEqual(new Date(2024, 0, 8))
  })
})

describe('formatDayHeader', () => {
  it('formats as "<Weekday> <M>/<D>"', () => {
    expect(formatDayHeader(new Date(2024, 0, 1))).toBe('Monday 1/1')
    expect(formatDayHeader(new Date(2024, 0, 2))).toBe('Tuesday 1/2')
    expect(formatDayHeader(new Date(2024, 11, 25))).toBe('Wednesday 12/25')
  })
})

describe('ordinalOfStep', () => {
  const lessons = [
    lessonRow({ id: 'l1', unit: 1, lesson_in_unit: 1 }),
    lessonRow({ id: 'l2', unit: 1, lesson_in_unit: 2 }),
    lessonRow({ id: 'l3', unit: 2, lesson_in_unit: 1 }),
  ]

  it('returns -1 for the not-started sentinel {0, 0}', () => {
    expect(ordinalOfStep(lessons, { unit: 0, lesson_in_unit: 0 })).toBe(-1)
  })

  it('returns the matching lesson index for an exact step match', () => {
    expect(ordinalOfStep(lessons, { unit: 1, lesson_in_unit: 1 })).toBe(0)
    expect(ordinalOfStep(lessons, { unit: 1, lesson_in_unit: 2 })).toBe(1)
    expect(ordinalOfStep(lessons, { unit: 2, lesson_in_unit: 1 })).toBe(2)
  })

  it('clamps to the last lesson index when the step is past every defined lesson', () => {
    expect(ordinalOfStep(lessons, { unit: 5, lesson_in_unit: 1 })).toBe(2)
  })

  it('returns the index of the closest preceding lesson for an in-between step', () => {
    expect(ordinalOfStep(lessons, { unit: 1, lesson_in_unit: 5 })).toBe(1)
  })
})

describe('projectSubjectWeek', () => {
  const subjectId = 'subj1'
  const lessons = [
    lessonRow({ id: 'l1', subject_id: subjectId, unit: 1, lesson_in_unit: 1, title: 'L1' }),
    lessonRow({ id: 'l2', subject_id: subjectId, unit: 1, lesson_in_unit: 2, title: 'L2' }),
    lessonRow({ id: 'l3', subject_id: subjectId, unit: 1, lesson_in_unit: 3, title: 'L3' }),
    lessonRow({ id: 'l4', subject_id: subjectId, unit: 2, lesson_in_unit: 1, title: 'L4' }),
    lessonRow({ id: 'l5', subject_id: subjectId, unit: 2, lesson_in_unit: 2, title: 'L5' }),
  ]
  const weekDates = [
    new Date(2024, 0, 1),
    new Date(2024, 0, 2),
    new Date(2024, 0, 3),
    new Date(2024, 0, 4),
    new Date(2024, 0, 5),
  ]

  it("averages every enrolled student's ordinal for Monday, then walks the next lesson forward for the rest of the week", () => {
    const progress = [
      progressRow({ student_id: 'a', subject_id: subjectId, step_unit: 1, step_lesson_in_unit: 3 }), // ordinal 2
      progressRow({ student_id: 'b', subject_id: subjectId, step_unit: 0, step_lesson_in_unit: 0 }), // ordinal -1
      progressRow({ student_id: 'c', subject_id: subjectId, step_unit: 1, step_lesson_in_unit: 3 }), // ordinal 2
    ]
    // avg = (2 + -1 + 2) / 3 = 1 -> rounds to 1 -> lessons[1] = L2

    const days = projectSubjectWeek(lessons, subjectId, progress, ['a', 'b', 'c'], weekDates)

    expect(days.map((d) => d.lesson?.title)).toEqual(['L2', 'L3', 'L4', 'L5', undefined])
  })

  it('treats students with no progress row as not-started (ordinal -1)', () => {
    const days = projectSubjectWeek(lessons, subjectId, [], ['a'], weekDates)

    expect(days[0].lesson?.title).toBe('L1')
  })

  it('defaults to the first lesson when there are no enrolled students to average', () => {
    const days = projectSubjectWeek(lessons, subjectId, [], [], weekDates)

    expect(days[0].lesson?.title).toBe('L1')
  })

  it('projects every day as lessonless when the subject has no lessons yet', () => {
    const days = projectSubjectWeek([], subjectId, [], ['a'], weekDates)

    expect(days.every((d) => d.lesson === undefined)).toBe(true)
    expect(days).toHaveLength(5)
  })

  it("only counts progress rows for the given subject, ignoring other subjects' progress", () => {
    const progress = [
      progressRow({ student_id: 'a', subject_id: 'other-subject', step_unit: 2, step_lesson_in_unit: 2 }),
    ]

    const days = projectSubjectWeek(lessons, subjectId, progress, ['a'], weekDates)

    expect(days[0].lesson?.title).toBe('L1') // 'a' has no progress in subjectId, so ordinal -1
  })

  it('leaves the remaining days lessonless once a day walks past the last defined lesson', () => {
    const progress = [
      progressRow({ student_id: 'a', subject_id: subjectId, step_unit: 2, step_lesson_in_unit: 2 }), // ordinal 4, the last lesson
    ]

    const days = projectSubjectWeek(lessons, subjectId, progress, ['a'], weekDates)

    expect(days.map((d) => d.lesson?.title)).toEqual(['L5', undefined, undefined, undefined, undefined])
  })
})

describe('buildWeeklyLessonPlan', () => {
  it('produces one row per subject, in the given subject order, alongside the upcoming week dates', () => {
    const subjects = [
      subjectRow({ id: 's1', name: 'Math', position: 0 }),
      subjectRow({ id: 's2', name: 'Reading', position: 1 }),
    ]
    const lessons = [
      lessonRow({ id: 'l1', subject_id: 's1', unit: 1, lesson_in_unit: 1, title: 'Math L1' }),
      lessonRow({ id: 'l2', subject_id: 's2', unit: 1, lesson_in_unit: 1, title: 'Reading L1' }),
    ]
    const monday = new Date(2024, 0, 1)

    const { weekDates, rows } = buildWeeklyLessonPlan(subjects, lessons, [], ['a'], monday)

    expect(weekDates).toEqual(getUpcomingWeekDates(monday))
    expect(rows.map((r) => r.subject.name)).toEqual(['Math', 'Reading'])
    expect(rows[0].days[0].lesson?.title).toBe('Math L1')
    expect(rows[1].days[0].lesson?.title).toBe('Reading L1')
  })
})
