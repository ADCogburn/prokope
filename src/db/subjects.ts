import { db, type SubjectRow } from './schema'

export interface CreateSubjectInput {
  class_id: string
  name: string
  position: number
}

export async function createSubject(input: CreateSubjectInput): Promise<SubjectRow> {
  const now = new Date().toISOString()
  const row: SubjectRow = {
    id: crypto.randomUUID(),
    class_id: input.class_id,
    name: input.name,
    position: input.position,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }
  await db.subject.add(row)
  return row
}

export async function listSubjectsForClass(classId: string): Promise<SubjectRow[]> {
  const rows = await db.subject.where('class_id').equals(classId).toArray()
  return rows.filter((row) => row.deleted_at === null).sort((a, b) => a.position - b.position)
}

/** Sets each subject's position to its index within orderedIds. */
export async function reorderSubjects(orderedIds: string[]): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction('rw', db.subject, async () => {
    await Promise.all(
      orderedIds.map((id, index) => db.subject.update(id, { position: index, updated_at: now })),
    )
  })
}

export async function deleteSubject(id: string): Promise<void> {
  const now = new Date().toISOString()
  await db.subject.update(id, { deleted_at: now, updated_at: now })
}
