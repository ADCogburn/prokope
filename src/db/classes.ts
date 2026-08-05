import { db, type ClassRow } from './schema'

export interface CreateClassInput {
  user_id: string
  name: string
}

export async function createClass(input: CreateClassInput): Promise<ClassRow> {
  const now = new Date().toISOString()
  const row: ClassRow = {
    id: crypto.randomUUID(),
    user_id: input.user_id,
    name: input.name,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }
  await db.class.add(row)
  return row
}

export async function getClass(id: string): Promise<ClassRow | undefined> {
  const row = await db.class.get(id)
  return row && row.deleted_at === null ? row : undefined
}

/**
 * MVP is single-class-per-teacher (per #12): at most one live row per
 * user_id. Sorted by created_at (rather than an unordered `.first()`) so
 * that if a second, decoy row ever exists locally -- #46 traced one path
 * where a client sync gap let that happen -- the teacher's real, original
 * class always wins over it deterministically.
 */
export async function getClassForUser(userId: string): Promise<ClassRow | undefined> {
  const rows = await db.class
    .where('user_id')
    .equals(userId)
    .filter((row) => row.deleted_at === null)
    .sortBy('created_at')
  return rows[0]
}

export async function deleteClass(id: string): Promise<void> {
  const now = new Date().toISOString()
  await db.class.update(id, { deleted_at: now, updated_at: now })
}
