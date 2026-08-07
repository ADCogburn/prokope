import { afterEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import { createSubject, deleteSubject, listSubjectsForClass, renameSubject, reorderSubjects } from './subjects'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('createSubject', () => {
  it('generates a client-side UUID primary key', async () => {
    const row = await createSubject({ class_id: 'class-1', name: 'Math', position: 0 })

    expect(row.id).toMatch(UUID_PATTERN)
    expect(row.deleted_at).toBeNull()
  })
})

describe('listSubjectsForClass', () => {
  it('returns rows scoped to the class, ordered by position', async () => {
    const b = await createSubject({ class_id: 'class-1', name: 'Reading', position: 1 })
    const a = await createSubject({ class_id: 'class-1', name: 'Math', position: 0 })
    await createSubject({ class_id: 'other-class', name: 'Science', position: 0 })

    const rows = await listSubjectsForClass('class-1')

    expect(rows.map((r) => r.id)).toEqual([a.id, b.id])
  })

  it('excludes soft-deleted rows by default', async () => {
    const kept = await createSubject({ class_id: 'class-1', name: 'Math', position: 0 })
    const removed = await createSubject({ class_id: 'class-1', name: 'Reading', position: 1 })
    await deleteSubject(removed.id)

    const rows = await listSubjectsForClass('class-1')

    expect(rows.map((r) => r.id)).toEqual([kept.id])
  })
})

describe('reorderSubjects', () => {
  it('rewrites position to match the given order', async () => {
    const a = await createSubject({ class_id: 'class-1', name: 'Math', position: 0 })
    const b = await createSubject({ class_id: 'class-1', name: 'Reading', position: 1 })

    await reorderSubjects([b.id, a.id])

    const rows = await listSubjectsForClass('class-1')
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id])
  })
})

describe('deleteSubject', () => {
  it('sets deleted_at without removing the row', async () => {
    const created = await createSubject({ class_id: 'class-1', name: 'Math', position: 0 })

    await deleteSubject(created.id)

    const raw = await db.subject.get(created.id)
    expect(raw).toBeDefined()
    expect(raw?.deleted_at).not.toBeNull()
  })
})

describe('renameSubject', () => {
  it('updates the name without touching other fields', async () => {
    const created = await createSubject({ class_id: 'class-1', name: 'Math', position: 0 })

    await renameSubject(created.id, 'Mathematics')

    const raw = await db.subject.get(created.id)
    expect(raw?.name).toBe('Mathematics')
    expect(raw?.class_id).toBe(created.class_id)
    expect(raw?.position).toBe(created.position)
  })
})
