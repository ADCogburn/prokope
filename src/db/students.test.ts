import { afterEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import { createStudent, deleteStudent, listStudentsForClass, renameStudent, reorderStudents } from './students'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('createStudent', () => {
  it('generates a client-side UUID primary key', async () => {
    const row = await createStudent({ class_id: 'class-1', name: 'Ada', position: 0 })

    expect(row.id).toMatch(UUID_PATTERN)
    expect(row.deleted_at).toBeNull()
  })
})

describe('listStudentsForClass', () => {
  it('returns rows scoped to the class, ordered by position', async () => {
    const b = await createStudent({ class_id: 'class-1', name: 'Bea', position: 1 })
    const a = await createStudent({ class_id: 'class-1', name: 'Ada', position: 0 })
    await createStudent({ class_id: 'other-class', name: 'Cy', position: 0 })

    const rows = await listStudentsForClass('class-1')

    expect(rows.map((r) => r.id)).toEqual([a.id, b.id])
  })

  it('excludes soft-deleted rows by default', async () => {
    const kept = await createStudent({ class_id: 'class-1', name: 'Ada', position: 0 })
    const removed = await createStudent({ class_id: 'class-1', name: 'Bea', position: 1 })
    await deleteStudent(removed.id)

    const rows = await listStudentsForClass('class-1')

    expect(rows.map((r) => r.id)).toEqual([kept.id])
  })
})

describe('reorderStudents', () => {
  it('rewrites position to match the given order', async () => {
    const a = await createStudent({ class_id: 'class-1', name: 'Ada', position: 0 })
    const b = await createStudent({ class_id: 'class-1', name: 'Bea', position: 1 })

    await reorderStudents([b.id, a.id])

    const rows = await listStudentsForClass('class-1')
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id])
  })
})

describe('deleteStudent', () => {
  it('sets deleted_at without removing the row', async () => {
    const created = await createStudent({ class_id: 'class-1', name: 'Ada', position: 0 })

    await deleteStudent(created.id)

    const raw = await db.student.get(created.id)
    expect(raw).toBeDefined()
    expect(raw?.deleted_at).not.toBeNull()
  })
})

describe('renameStudent', () => {
  it('updates the name without touching other fields', async () => {
    const created = await createStudent({ class_id: 'class-1', name: 'Ada', position: 0 })

    await renameStudent(created.id, 'Ada Lovelace')

    const raw = await db.student.get(created.id)
    expect(raw?.name).toBe('Ada Lovelace')
    expect(raw?.class_id).toBe(created.class_id)
    expect(raw?.position).toBe(created.position)
  })
})
