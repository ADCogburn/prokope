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
  review: boolean
  review_hlc: string
  review_client_id: string
  updated_at: string
}

class ProkopeDatabase extends Dexie {
  class!: EntityTable<ClassRow, 'id'>
  subject!: EntityTable<SubjectRow, 'id'>
  lesson!: EntityTable<LessonRow, 'id'>
  student!: EntityTable<StudentRow, 'id'>
  progress!: EntityTable<ProgressRow, 'id'>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      class: 'id, user_id',
      subject: 'id, class_id, [class_id+position]',
      lesson: 'id, subject_id, &[subject_id+unit+lesson_in_unit]',
      student: 'id, class_id, [class_id+position]',
      progress: 'id, &[student_id+subject_id]',
    })
  }
}

export const db = new ProkopeDatabase('prokope')
