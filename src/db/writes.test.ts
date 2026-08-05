import { afterEach, describe, expect, it, vi } from 'vitest'
import { db, type ClassRow, type ProgressRow } from './schema'
import { onLocalWrite } from './writes'

function makeClass(overrides: Partial<ClassRow> = {}): ClassRow {
  return {
    id: 'class-1',
    user_id: 'user-1',
    name: 'Room 5',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

function makeProgress(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    id: 'progress-1',
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

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('onLocalWrite', () => {
  it('fires on an insert', async () => {
    const callback = vi.fn()
    onLocalWrite(callback)

    await db.class.add(makeClass())

    expect(callback).toHaveBeenCalled()
  })

  it('fires on an update', async () => {
    await db.class.add(makeClass())
    const callback = vi.fn()
    onLocalWrite(callback)

    await db.class.update('class-1', { name: 'Renamed' })

    expect(callback).toHaveBeenCalled()
  })

  it('fires on a delete', async () => {
    await db.class.add(makeClass())
    const callback = vi.fn()
    onLocalWrite(callback)

    await db.class.delete('class-1')

    expect(callback).toHaveBeenCalled()
  })

  it('fires for writes to every entity table, not just class', async () => {
    const callback = vi.fn()
    onLocalWrite(callback)

    await db.progress.add(makeProgress())

    expect(callback).toHaveBeenCalled()
  })

  it('stops firing once unsubscribed', async () => {
    const callback = vi.fn()
    const unsubscribe = onLocalWrite(callback)
    unsubscribe()

    await db.class.add(makeClass())

    expect(callback).not.toHaveBeenCalled()
  })

  it('does not affect a second, independent subscriber when one unsubscribes', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = onLocalWrite(first)
    onLocalWrite(second)
    unsubscribeFirst()

    await db.class.add(makeClass())

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalled()
  })
})
