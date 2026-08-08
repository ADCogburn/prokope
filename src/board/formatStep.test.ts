import { describe, expect, it } from 'vitest'
import { formatStep } from './formatStep'
import type { ProgressRow } from '../db/schema'

function progressRow(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    id: 'p1',
    student_id: 's1',
    subject_id: 'subj1',
    step_unit: 1,
    step_lesson_in_unit: 2,
    step_hlc: 'hlc',
    step_client_id: 'client',
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('formatStep', () => {
  it('shows "Not started" when there is no progress row', () => {
    expect(formatStep(undefined)).toBe('Not started')
  })

  it('shows "Not started" for the {0,0} sentinel step', () => {
    expect(formatStep(progressRow({ step_unit: 0, step_lesson_in_unit: 0 }))).toBe('Not started')
  })

  it('formats a real step as Lesson unit.lessonInUnit', () => {
    expect(formatStep(progressRow({ step_unit: 3, step_lesson_in_unit: 4 }))).toBe('Lesson 3.4')
  })
})
