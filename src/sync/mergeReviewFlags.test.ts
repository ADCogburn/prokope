import { describe, expect, it } from 'vitest'
import type { ReviewFlagRow } from '../db'
import { mergeReviewFlagRows } from './mergeReviewFlags'

function makeRow(overrides: Partial<ReviewFlagRow> = {}): ReviewFlagRow {
  return {
    id: 'existing-id',
    student_id: 'student-1',
    lesson_id: 'lesson-1',
    flagged: false,
    hlc: 'hlc-1',
    client_id: 'client-a',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('mergeReviewFlagRows', () => {
  it('same-side-wins: keeps the existing (incumbent) flagged/hlc when incoming hlc sorts earlier', () => {
    const existing = makeRow({ flagged: true, hlc: 'hlc-9' })
    const incoming = makeRow({ id: 'incoming-id', flagged: false, hlc: 'hlc-1' })

    const merged = mergeReviewFlagRows(existing, incoming)

    expect(merged.flagged).toBe(true)
    expect(merged.hlc).toBe('hlc-9')
  })

  it('other-side-wins: takes incoming flagged/hlc when its hlc sorts later than the existing row', () => {
    const existing = makeRow({ flagged: false, hlc: 'hlc-1' })
    const incoming = makeRow({ id: 'incoming-id', flagged: true, hlc: 'hlc-9' })

    const merged = mergeReviewFlagRows(existing, incoming)

    expect(merged.flagged).toBe(true)
    expect(merged.hlc).toBe('hlc-9')
  })

  it('tie-breaks an exactly-equal hlc by client_id', () => {
    const existing = makeRow({ hlc: 'hlc-1', client_id: 'aaaa', flagged: false })
    const incoming = makeRow({ id: 'incoming-id', hlc: 'hlc-1', client_id: 'zzzz', flagged: true })

    const merged = mergeReviewFlagRows(existing, incoming)

    expect(merged.flagged).toBe(true)
    expect(merged.client_id).toBe('zzzz')
  })

  it('a lower client_id loses the tie-break even though it is the incoming side', () => {
    const existing = makeRow({ hlc: 'hlc-1', client_id: 'zzzz', flagged: false })
    const incoming = makeRow({ id: 'incoming-id', hlc: 'hlc-1', client_id: 'aaaa', flagged: true })

    const merged = mergeReviewFlagRows(existing, incoming)

    expect(merged.flagged).toBe(false)
    expect(merged.client_id).toBe('zzzz')
  })

  it('takes the later updated_at of the two rows', () => {
    const existing = makeRow({ updated_at: '2024-06-01T00:00:00.000Z' })
    const incoming = makeRow({ id: 'incoming-id', updated_at: '2024-01-01T00:00:00.000Z' })

    const merged = mergeReviewFlagRows(existing, incoming)

    expect(merged.updated_at).toBe('2024-06-01T00:00:00.000Z')
  })

  it("the merge result's id, student_id, and lesson_id always come from incoming", () => {
    const existing = makeRow({ id: 'existing-id' })
    const incoming = makeRow({ id: 'incoming-id' })

    const merged = mergeReviewFlagRows(existing, incoming)

    expect(merged.id).toBe('incoming-id')
    expect(merged.student_id).toBe(incoming.student_id)
    expect(merged.lesson_id).toBe(incoming.lesson_id)
  })
})
