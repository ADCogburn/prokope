import Dexie, { type EntityTable } from 'dexie'

interface SoftDeletable {
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ClassRow extends SoftDeletable {
  id: string
  user_id: string
  name: string
}

export interface SubjectRow extends SoftDeletable {
  id: string
  class_id: string
  name: string
  position: number
}

export interface LessonRow extends SoftDeletable {
  id: string
  subject_id: string
  unit: number
  lesson_in_unit: number
  title: string
  description: string
}

export interface StudentRow extends SoftDeletable {
  id: string
  class_id: string
  name: string
  position: number
}

export interface ProgressRow {
  id: string
  student_id: string
  subject_id: string
  step_unit: number
  step_lesson_in_unit: number
  step_hlc: string
  step_client_id: string
  updated_at: string
}

// #152/ADR-0011: replaces Progress.review/review_hlc/review_client_id with a
// standalone per-(student, lesson) flag, so a flag can target any lesson --
// past, current, or upcoming -- independent of the student's current
// position. Same single-field HLC+client-id LWW-register shape as
// progress.step*.
export interface ReviewFlagRow {
  id: string
  student_id: string
  lesson_id: string
  flagged: boolean
  hlc: string
  client_id: string
  updated_at: string
}

// #165: keyed by user_id directly (not derived via a Class/Subject FK), so a
// Template outlives its source Subject/Class. Immutable once created -- #147
// has no rename/delete/edit path for a Template -- but `updated_at` is still
// carried (never mutated after creation) because src/sync/engine.ts's
// watermark computation expects every synced row to have one.
export interface SubjectTemplateRow {
  id: string
  user_id: string
  name: string
  created_at: string
  updated_at: string
}

export interface SubjectTemplateLessonRow {
  id: string
  subject_template_id: string
  unit: number
  lesson_in_unit: number
  title: string
  description: string
  created_at: string
  updated_at: string
}

// Class Templates (#168): a saved snapshot of a Class's Subjects/Lessons at
// save time, keyed by user_id directly (no class_id -- the source Class may
// later be renamed, edited, or deleted without affecting the template).
// Immutable/create-only, same as #165's Subject Templates -- no deleted_at,
// nothing ever mutates a row after creation. created_at/updated_at are still
// carried on every row (even though updated_at never changes post-create)
// because the sync engine's watermark math (src/sync/engine.ts's
// maxUpdatedAt/batchWatermark) expects every synced row to have one.
export interface ClassTemplateRow {
  id: string
  user_id: string
  name: string
  created_at: string
  updated_at: string
}

export interface ClassTemplateSubjectRow {
  id: string
  class_template_id: string
  name: string
  position: number
  created_at: string
  updated_at: string
}

export interface ClassTemplateLessonRow {
  id: string
  class_template_subject_id: string
  unit: number
  lesson_in_unit: number
  title: string
  description: string
  created_at: string
  updated_at: string
}

class ProkopeDatabase extends Dexie {
  class!: EntityTable<ClassRow, 'id'>
  subject!: EntityTable<SubjectRow, 'id'>
  lesson!: EntityTable<LessonRow, 'id'>
  student!: EntityTable<StudentRow, 'id'>
  progress!: EntityTable<ProgressRow, 'id'>
  review_flag!: EntityTable<ReviewFlagRow, 'id'>
  subject_template!: EntityTable<SubjectTemplateRow, 'id'>
  subject_template_lesson!: EntityTable<SubjectTemplateLessonRow, 'id'>
  class_template!: EntityTable<ClassTemplateRow, 'id'>
  class_template_subject!: EntityTable<ClassTemplateSubjectRow, 'id'>
  class_template_lesson!: EntityTable<ClassTemplateLessonRow, 'id'>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      class: 'id, user_id',
      subject: 'id, class_id, [class_id+position]',
      lesson: 'id, subject_id, &[subject_id+unit+lesson_in_unit]',
      student: 'id, class_id, [class_id+position]',
      progress: 'id, &[student_id+subject_id]',
    })
    // #135/ADR-0010: drops the DB-level uniqueness from this compound index
    // (IndexedDB excludes a record from a compound index entirely when any
    // key-path component is null, so a `deleted_at`-inclusive unique index
    // can't actually enforce anything among live rows, whose deleted_at is
    // null) -- kept as a plain index for position lookups, with createLesson
    // now doing the uniqueness check against live rows itself. No data
    // migration needed.
    this.version(2).stores({
      lesson: 'id, subject_id, [subject_id+unit+lesson_in_unit]',
    })
    // #152/ADR-0011: review_flag replaces progress.review/review_hlc/
    // review_client_id entirely (dropped from the progress store below, no
    // migration of existing flagged data -- see the ADR). Keyed by
    // (student_id, lesson_id) rather than (student_id, subject_id).
    this.version(3).stores({
      progress: 'id, &[student_id+subject_id]',
      review_flag: 'id, &[student_id+lesson_id]',
    })
    // #165: subject_template rows are looked up by owning user_id (see the
    // interface comment above); subject_template_lesson rows are looked up
    // by owning template. Neither table has a soft-delete or position
    // concept, so a plain index is enough -- same shape as `class`.
    this.version(4).stores({
      subject_template: 'id, user_id',
      subject_template_lesson: 'id, subject_template_id',
    })
    // #168: Class Templates. Simple indexes only -- these rows are
    // immutable and create-only, so unlike class/subject/lesson there's no
    // soft-delete or position-ordering compound key to support.
    this.version(5).stores({
      class_template: 'id, user_id',
      class_template_subject: 'id, class_template_id',
      class_template_lesson: 'id, class_template_subject_id',
    })
  }
}

export const db = new ProkopeDatabase('prokope')
