import { db, type StudentRow } from './schema'

export interface CreateStudentInput {
  class_id: string
  name: string
  position: number
}

export async function createStudent(input: CreateStudentInput): Promise<StudentRow> {
  const now = new Date().toISOString()
  const row: StudentRow = {
    id: crypto.randomUUID(),
    class_id: input.class_id,
    name: input.name,
    position: input.position,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }
  await db.student.add(row)
  return row
}

export async function getStudent(id: string): Promise<StudentRow | undefined> {
  const row = await db.student.get(id)
  return row && row.deleted_at === null ? row : undefined
}

export async function listStudentsForClass(classId: string): Promise<StudentRow[]> {
  const rows = await db.student.where('class_id').equals(classId).toArray()
  return rows.filter((row) => row.deleted_at === null).sort((a, b) => a.position - b.position)
}

/** Sets each student's position to its index within orderedIds. */
export async function reorderStudents(orderedIds: string[]): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction('rw', db.student, async () => {
    await Promise.all(
      orderedIds.map((id, index) => db.student.update(id, { position: index, updated_at: now })),
    )
  })
}

export async function deleteStudent(id: string): Promise<void> {
  const now = new Date().toISOString()
  await db.student.update(id, { deleted_at: now, updated_at: now })
}

export async function renameStudent(id: string, name: string): Promise<void> {
  const now = new Date().toISOString()
  await db.student.update(id, { name, updated_at: now })
}
