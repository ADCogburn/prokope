import {
  db,
  type ClassRow,
  type SubjectRow,
  type LessonRow,
  type StudentRow,
  type ProgressRow,
  type ReviewFlagRow,
  type SubjectTemplateRow,
  type SubjectTemplateLessonRow,
  type ClassTemplateRow,
  type ClassTemplateSubjectRow,
  type ClassTemplateLessonRow,
} from './schema'

export interface SyncSnapshot {
  classes: ClassRow[]
  subjects: SubjectRow[]
  lessons: LessonRow[]
  students: StudentRow[]
  progress: ProgressRow[]
  // snake_case (not reviewFlags) to match the wire JSON key the server's
  // System.Text.Json emits (server/Sync/SyncContracts.cs's
  // JsonPropertyName("review_flags")) -- this batch is serialized near-
  // verbatim over the wire, same rationale as every other field here.
  review_flags: ReviewFlagRow[]
  subject_templates: SubjectTemplateRow[]
  subject_template_lessons: SubjectTemplateLessonRow[]
  class_templates: ClassTemplateRow[]
  class_template_subjects: ClassTemplateSubjectRow[]
  class_template_lessons: ClassTemplateLessonRow[]
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
  const [
    classes,
    subjects,
    lessons,
    students,
    progress,
    reviewFlags,
    subjectTemplates,
    subjectTemplateLessons,
    classTemplates,
    classTemplateSubjects,
    classTemplateLessons,
  ] = await Promise.all([
    db.class.toArray(),
    db.subject.toArray(),
    db.lesson.toArray(),
    db.student.toArray(),
    db.progress.toArray(),
    db.review_flag.toArray(),
    db.subject_template.toArray(),
    db.subject_template_lesson.toArray(),
    db.class_template.toArray(),
    db.class_template_subject.toArray(),
    db.class_template_lesson.toArray(),
  ])
  return {
    classes: classes.filter(isNewer),
    subjects: subjects.filter(isNewer),
    lessons: lessons.filter(isNewer),
    students: students.filter(isNewer),
    progress: progress.filter(isNewer),
    review_flags: reviewFlags.filter(isNewer),
    subject_templates: subjectTemplates.filter(isNewer),
    subject_template_lessons: subjectTemplateLessons.filter(isNewer),
    class_templates: classTemplates.filter(isNewer),
    class_template_subjects: classTemplateSubjects.filter(isNewer),
    class_template_lessons: classTemplateLessons.filter(isNewer),
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

export const getRawReviewFlagByPair = (studentId: string, lessonId: string): Promise<ReviewFlagRow | undefined> =>
  db.review_flag.where('[student_id+lesson_id]').equals([studentId, lessonId]).first()
export const putRawReviewFlag = (row: ReviewFlagRow): Promise<string> => db.review_flag.put(row)
export const deleteRawReviewFlag = (id: string): Promise<void> => db.review_flag.delete(id)

// #165: Template rows are create-only -- no rename/delete path exists (see
// SubjectTemplateRow's doc comment in schema.ts) -- so there's no getRaw/
// deleteRaw pair to mirror class/subject/lesson/student's; a remote row is
// simply upserted-by-id like theirs, never merged by a natural key like
// progress.
export const putRawSubjectTemplate = (row: SubjectTemplateRow): Promise<string> => db.subject_template.put(row)
export const putRawSubjectTemplateLesson = (row: SubjectTemplateLessonRow): Promise<string> =>
  db.subject_template_lesson.put(row)

// class_template/class_template_subject/class_template_lesson (#168) are
// immutable and create-only -- no soft-delete, nothing ever mutates a row
// after creation -- so unlike the tables above, there's no getRaw/deleteRaw
// pair or natural-key merge to support here, just a plain overwrite-by-id.
export const putRawClassTemplate = (row: ClassTemplateRow): Promise<string> => db.class_template.put(row)
export const putRawClassTemplateSubject = (row: ClassTemplateSubjectRow): Promise<string> =>
  db.class_template_subject.put(row)
export const putRawClassTemplateLesson = (row: ClassTemplateLessonRow): Promise<string> =>
  db.class_template_lesson.put(row)

// Wipes every local table. Called on account switch (see resetLocalStore in
// sync/engine.ts) so a previous session's rows -- tagged with a user_id the
// new session's token doesn't own -- can't get swept into the next push and
// rejected by the server's ownership check.
export async function clearAllTables(): Promise<void> {
  await Promise.all(db.tables.map((table) => table.clear()))
}
