import { db, type LessonRow } from './schema'

export interface CreateLessonInput {
  subject_id: string
  unit: number
  lesson_in_unit: number
  title: string
  description: string
}

export async function createLesson(input: CreateLessonInput): Promise<LessonRow> {
  const now = new Date().toISOString()
  const row: LessonRow = {
    id: crypto.randomUUID(),
    subject_id: input.subject_id,
    unit: input.unit,
    lesson_in_unit: input.lesson_in_unit,
    title: input.title,
    description: input.description,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }
  await db.lesson.add(row)
  return row
}

export async function listLessonsForSubject(subjectId: string): Promise<LessonRow[]> {
  const rows = await db.lesson.where('subject_id').equals(subjectId).toArray()
  return rows
    .filter((row) => row.deleted_at === null)
    .sort((a, b) => a.unit - b.unit || a.lesson_in_unit - b.lesson_in_unit)
}

export async function getLessonByPosition(
  subjectId: string,
  unit: number,
  lessonInUnit: number,
): Promise<LessonRow | undefined> {
  const row = await db.lesson
    .where('[subject_id+unit+lesson_in_unit]')
    .equals([subjectId, unit, lessonInUnit])
    .first()
  return row && row.deleted_at === null ? row : undefined
}

export async function deleteLesson(id: string): Promise<void> {
  const now = new Date().toISOString()
  await db.lesson.update(id, { deleted_at: now, updated_at: now })
}
