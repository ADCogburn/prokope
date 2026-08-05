import { describe, expect, it } from 'vitest'
import type { ProgressRow } from '../db'
import { mergeProgressRows } from './mergeProgress'

function makeRow(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    id: 'existing-id',
    student_id: 'student-1',
    subject_id: 'subject-1',
    step_unit: 1,
    step_lesson_in_unit: 1,
    step_hlc: 'hlc-1',
    step_client_id: 'client-a',
    review: false,
    review_hlc: 'hlc-1',
    review_client_id: 'client-a',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('mergeProgressRows', () => {
  it('takes step fields from incoming when its step_hlc sorts later', () => {
    const existing = makeRow({ step_unit: 1, step_hlc: 'hlc-1' })
    const incoming = makeRow({ id: 'incoming-id', step_unit: 2, step_hlc: 'hlc-2' })

    const merged = mergeProgressRows(existing, incoming)

    expect(merged.step_unit).toBe(2)
    expect(merged.step_hlc).toBe('hlc-2')
  })

  it('keeps existing step fields when incoming step_hlc sorts earlier', () => {
    const existing = makeRow({ step_unit: 5, step_hlc: 'hlc-9' })
    const incoming = makeRow({ id: 'incoming-id', step_unit: 1, step_hlc: 'hlc-1' })

    const merged = mergeProgressRows(existing, incoming)

    expect(merged.step_unit).toBe(5)
    expect(merged.step_hlc).toBe('hlc-9')
  })

  it('resolves step and review independently -- one can win from incoming while the other loses', () => {
    const existing = makeRow({ step_hlc: 'hlc-9', review: false, review_hlc: 'hlc-1' })
    const incoming = makeRow({
      id: 'incoming-id',
      step_unit: 42,
      step_hlc: 'hlc-1',
      review: true,
      review_hlc: 'hlc-2',
    })

    const merged = mergeProgressRows(existing, incoming)

    expect(merged.step_hlc).toBe('hlc-9')
    expect(merged.step_unit).toBe(existing.step_unit)
    expect(merged.review).toBe(true)
    expect(merged.review_hlc).toBe('hlc-2')
  })

  it('tie-breaks an exactly-equal HLC by client_id', () => {
    const existing = makeRow({ step_hlc: 'hlc-1', step_client_id: 'aaaa', step_unit: 1 })
    const incoming = makeRow({ id: 'incoming-id', step_hlc: 'hlc-1', step_client_id: 'zzzz', step_unit: 2 })

    const merged = mergeProgressRows(existing, incoming)

    expect(merged.step_unit).toBe(2)
    expect(merged.step_client_id).toBe('zzzz')
  })

  it('takes the later updated_at of the two rows', () => {
    const existing = makeRow({ updated_at: '2024-06-01T00:00:00.000Z' })
    const incoming = makeRow({ id: 'incoming-id', updated_at: '2024-01-01T00:00:00.000Z' })

    const merged = mergeProgressRows(existing, incoming)

    expect(merged.updated_at).toBe('2024-06-01T00:00:00.000Z')
  })

  it("the merge result's id, student_id, and subject_id always come from incoming", () => {
    const existing = makeRow({ id: 'existing-id' })
    const incoming = makeRow({ id: 'incoming-id' })

    const merged = mergeProgressRows(existing, incoming)

    expect(merged.id).toBe('incoming-id')
    expect(merged.student_id).toBe(incoming.student_id)
    expect(merged.subject_id).toBe(incoming.subject_id)
  })
})
