import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from './schema'
import { createClass, deleteClass, getClass, getClassForUser, renameClass } from './classes'

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

describe('getClassForUser', () => {
  it('returns the user\'s class', async () => {
    const created = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    expect(await getClassForUser('user-1')).toEqual(created)
  })

  it('returns undefined when the user has no class yet', async () => {
    expect(await getClassForUser('user-1')).toBeUndefined()
  })

  it('ignores a soft-deleted class', async () => {
    const created = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    await deleteClass(created.id)

    expect(await getClassForUser('user-1')).toBeUndefined()
  })

  it('does not return another user\'s class', async () => {
    await createClass({ user_id: 'user-2', name: 'Other Homeroom' })

    expect(await getClassForUser('user-1')).toBeUndefined()
  })

  // A user should only ever have one live class (per #12), but #46 traced a
  // client sync gap that could let a second, empty one get created locally
  // before the real one arrived. Deterministically preferring the oldest
  // row means that decoy never wins over the teacher's actual class. Pins
  // each row's random UUID so the decoy's id would sort first alphabetically
  // -- an unordered `.first()` would pick it, proving the sort is what
  // makes this deterministic rather than getting lucky on id order.
  it('prefers the earliest-created class when more than one somehow exists', async () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID')
    randomUUID.mockReturnValueOnce('bbbbbbbb-0000-0000-0000-000000000000')
    const seeded = await createClass({ user_id: 'user-1', name: 'Seeded Class' })
    await new Promise((resolve) => setTimeout(resolve, 2))
    randomUUID.mockReturnValueOnce('aaaaaaaa-0000-0000-0000-000000000000')
    await createClass({ user_id: 'user-1', name: 'Accidental Decoy' })
    randomUUID.mockRestore()

    expect(await getClassForUser('user-1')).toEqual(seeded)
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

describe('renameClass', () => {
  it('updates the name without touching other fields', async () => {
    const created = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    await renameClass(created.id, 'Room 12')

    const raw = await db.class.get(created.id)
    expect(raw?.name).toBe('Room 12')
    expect(raw?.user_id).toBe(created.user_id)
    expect(raw?.id).toBe(created.id)
  })
})
