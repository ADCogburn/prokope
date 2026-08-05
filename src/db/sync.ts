import { db, type ClassRow, type SubjectRow, type LessonRow, type StudentRow, type ProgressRow } from './schema'

export interface SyncSnapshot {
  classes: ClassRow[]
  subjects: SubjectRow[]
  lessons: LessonRow[]
  students: StudentRow[]
  progress: ProgressRow[]
}

/**
 * Sync-only raw accessors for #20's client sync engine (src/sync/). Unlike
 * the entity modules' public CRUD (classes.ts, subjects.ts, ...), these
 * bypass soft-delete filtering and never stamp create-time defaults -- the
 * sync engine, not this module, owns deciding what to write and when and how
 * to resolve a conflict, per #19's "no concept of a sync queue or CRDT merge"
 * boundary. Deliberately not re-exported through index.ts's feature-facing
 * barrel; src/sync/ imports this file directly.
 */
export async function listRowsUpdatedSince(since: string | null): Promise<SyncSnapshot> {
  const isNewer = (row: { updated_at: string }) => since === null || row.updated_at > since
  const [classes, subjects, lessons, students, progress] = await Promise.all([
    db.class.toArray(),
    db.subject.toArray(),
    db.lesson.toArray(),
    db.student.toArray(),
    db.progress.toArray(),
  ])
  return {
    classes: classes.filter(isNewer),
    subjects: subjects.filter(isNewer),
    lessons: lessons.filter(isNewer),
    students: students.filter(isNewer),
    progress: progress.filter(isNewer),
  }
}

export const getRawClass = (id: string): Promise<ClassRow | undefined> => db.class.get(id)
export const putRawClass = (row: ClassRow): Promise<string> => db.class.put(row)

export const getRawSubject = (id: string): Promise<SubjectRow | undefined> => db.subject.get(id)
export const putRawSubject = (row: SubjectRow): Promise<string> => db.subject.put(row)

export const getRawLesson = (id: string): Promise<LessonRow | undefined> => db.lesson.get(id)
export const putRawLesson = (row: LessonRow): Promise<string> => db.lesson.put(row)

export const getRawStudent = (id: string): Promise<StudentRow | undefined> => db.student.get(id)
export const putRawStudent = (row: StudentRow): Promise<string> => db.student.put(row)

export const getRawProgressByPair = (studentId: string, subjectId: string): Promise<ProgressRow | undefined> =>
  db.progress.where('[student_id+subject_id]').equals([studentId, subjectId]).first()
export const putRawProgress = (row: ProgressRow): Promise<string> => db.progress.put(row)
export const deleteRawProgress = (id: string): Promise<void> => db.progress.delete(id)
