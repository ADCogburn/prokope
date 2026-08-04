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

export async function deleteClass(id: string): Promise<void> {
  const now = new Date().toISOString()
  await db.class.update(id, { deleted_at: now, updated_at: now })
}
