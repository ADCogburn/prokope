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

class ProkopeDatabase extends Dexie {
  class!: EntityTable<ClassRow, 'id'>
  subject!: EntityTable<SubjectRow, 'id'>
  lesson!: EntityTable<LessonRow, 'id'>
  student!: EntityTable<StudentRow, 'id'>
  progress!: EntityTable<ProgressRow, 'id'>
  review_flag!: EntityTable<ReviewFlagRow, 'id'>

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
  }
}

export const db = new ProkopeDatabase('prokope')
