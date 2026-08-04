import { afterEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import { createClass, deleteClass, getClass } from './classes'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('createClass', () => {
  it('generates a client-side UUID primary key', async () => {
    const row = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    expect(row.id).toMatch(UUID_PATTERN)
    expect(row.name).toBe('Homeroom')
    expect(row.user_id).toBe('user-1')
    expect(row.deleted_at).toBeNull()
  })

  it('persists the row so it can be read back via getClass', async () => {
    const created = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    const found = await getClass(created.id)

    expect(found).toEqual(created)
  })
})

describe('getClass', () => {
  it('returns undefined for a soft-deleted row', async () => {
    const created = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    await deleteClass(created.id)

    expect(await getClass(created.id)).toBeUndefined()
  })

  it('returns undefined for a non-existent row', async () => {
    expect(await getClass('missing-id')).toBeUndefined()
  })
})

describe('deleteClass', () => {
  it('sets deleted_at without removing the row', async () => {
    const created = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    await deleteClass(created.id)

    const raw = await db.class.get(created.id)
    expect(raw).toBeDefined()
    expect(raw?.deleted_at).not.toBeNull()
  })
})
