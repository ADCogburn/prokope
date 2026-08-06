import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { WeeklyLessonPlanReport } from './WeeklyLessonPlanReport'
import type { WeeklyLessonPlanRow } from './weeklyLessonPlan'
import type { LessonRow, SubjectRow } from '../db/schema'

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

function lessonRow(overrides: Partial<LessonRow> = {}): LessonRow {
  return {
    id: 'lesson1',
    subject_id: 'subj1',
    unit: 1,
    lesson_in_unit: 1,
    title: 'Fractions',
    description: 'Add and subtract fractions.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  }
}

const weekDates = [
  new Date(2024, 0, 1), // Monday
  new Date(2024, 0, 2),
  new Date(2024, 0, 3),
  new Date(2024, 0, 4),
  new Date(2024, 0, 5),
]

describe('WeeklyLessonPlanReport', () => {
  it('renders the template title and static note verbatim, per #23', () => {
    render(<WeeklyLessonPlanReport weekDates={weekDates} rows={[]} />)

    expect(screen.getByText('Weekly Lesson Plan Template/Pacing Guide')).toBeInTheDocument()
    expect(screen.getByText('*please note days of any tests/quizzes in plans.')).toBeInTheDocument()
  })

  it('renders a "Week" label column and Monday-Friday headers with dates', () => {
    render(<WeeklyLessonPlanReport weekDates={weekDates} rows={[]} />)

    expect(screen.getByRole('columnheader', { name: 'Week' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Monday 1/1' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Tuesday 1/2' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Wednesday 1/3' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Thursday 1/4' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Friday 1/5' })).toBeInTheDocument()
  })

  it('renders one row per subject with the subject name as the row label', () => {
    const rows: WeeklyLessonPlanRow[] = [
      { subject: subjectRow({ id: 's1', name: 'Math' }), days: weekDates.map((date) => ({ date, lesson: undefined })) },
      {
        subject: subjectRow({ id: 's2', name: 'Reading' }),
        days: weekDates.map((date) => ({ date, lesson: undefined })),
      },
    ]

    render(<WeeklyLessonPlanReport weekDates={weekDates} rows={rows} />)

    expect(screen.getByRole('rowheader', { name: 'Math' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Reading' })).toBeInTheDocument()
  })

  it('renders "Lesson:" and "Notes:" text for a projected day', () => {
    const lesson = lessonRow({ title: 'Fractions', description: 'Add and subtract fractions.' })
    const rows: WeeklyLessonPlanRow[] = [
      {
        subject: subjectRow({ id: 's1', name: 'Math' }),
        days: [
          { date: weekDates[0], lesson },
          ...weekDates.slice(1).map((date) => ({ date, lesson: undefined })),
        ],
      },
    ]

    render(<WeeklyLessonPlanReport weekDates={weekDates} rows={rows} />)

    const row = screen.getByRole('row', { name: /Math/ })
    expect(within(row).getByText('Lesson: 1.1 - Fractions')).toBeInTheDocument()
    expect(within(row).getByText('Notes: Add and subtract fractions.')).toBeInTheDocument()
  })

  it('renders bare "Lesson:"/"Notes:" labels (no text) for a lessonless day', () => {
    const rows: WeeklyLessonPlanRow[] = [
      { subject: subjectRow({ id: 's1', name: 'Math' }), days: weekDates.map((date) => ({ date, lesson: undefined })) },
    ]

    render(<WeeklyLessonPlanReport weekDates={weekDates} rows={rows} />)

    const row = screen.getByRole('row', { name: /Math/ })
    expect(within(row).getAllByText('Lesson:')).toHaveLength(5)
    expect(within(row).getAllByText('Notes:')).toHaveLength(5)
  })
})
