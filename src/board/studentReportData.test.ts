import { describe, expect, it } from 'vitest'
import type { LessonRow, ProgressRow, StudentRow, SubjectRow } from '../db/schema'
import { buildStudentReport } from './studentReportData'

function studentRow(overrides: Partial<StudentRow> = {}): StudentRow {
  return {
    id: 'student1',
    class_id: 'class1',
    name: 'Emily',
    position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  }
}

function subjectRow(overrides: Partial<SubjectRow> = {}): SubjectRow {
  return {
    id: 'subj1',
    class_id: 'class1',
    name: 'Math',
    position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  }
}

function lessonRow(overrides: Partial<LessonRow> = {}): LessonRow {
  return {
    id: 'lesson1',
    subject_id: 'subj1',
    unit: 1,
    lesson_in_unit: 1,
    title: 'Fractions',
    description: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  }
}

function progressRow(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    id: 'progress1',
    student_id: 'student1',
    subject_id: 'subj1',
    step_unit: 0,
    step_lesson_in_unit: 0,
    step_hlc: '',
    step_client_id: '',
    review: false,
    review_hlc: '',
    review_client_id: '',
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('buildStudentReport', () => {
  it("shows the current lesson's title (not the raw unit/lesson_in_unit id) for a subject the student has progress in", () => {
    const student = studentRow()
    const subjects = [subjectRow({ id: 'subj1', name: 'Math' })]
    const lessons = [lessonRow({ id: 'l1', subject_id: 'subj1', unit: 1, lesson_in_unit: 1, title: 'Fractions' })]
    const progress = [
      progressRow({ student_id: student.id, subject_id: 'subj1', step_unit: 1, step_lesson_in_unit: 1 }),
    ]

    const report = buildStudentReport(student, subjects, lessons, progress)

    expect(report.student).toBe(student)
    expect(report.subjectRows).toEqual([
      { subject: subjects[0], lessonTitle: 'Fractions', hasLessons: true, reviewFlagged: false },
    ])
  })

  it('reports "not started" (no lesson title) for a subject with lessons but no progress row yet', () => {
    const student = studentRow()
    const subjects = [subjectRow({ id: 'subj1', name: 'Math' })]
    const lessons = [lessonRow({ id: 'l1', subject_id: 'subj1' })]

    const report = buildStudentReport(student, subjects, lessons, [])

    expect(report.subjectRows[0]).toEqual({
      subject: subjects[0],
      lessonTitle: undefined,
      hasLessons: true,
      reviewFlagged: false,
    })
  })

  it('marks hasLessons false for a subject with no lessons defined at all', () => {
    const student = studentRow()
    const subjects = [subjectRow({ id: 'subj1', name: 'Math' })]

    const report = buildStudentReport(student, subjects, [], [])

    expect(report.subjectRows[0]).toEqual({
      subject: subjects[0],
      lessonTitle: undefined,
      hasLessons: false,
      reviewFlagged: false,
    })
  })

  it('carries the review flag through from the progress row', () => {
    const student = studentRow()
    const subjects = [subjectRow({ id: 'subj1', name: 'Math' })]
    const lessons = [lessonRow({ id: 'l1', subject_id: 'subj1', unit: 1, lesson_in_unit: 1, title: 'Fractions' })]
    const progress = [
      progressRow({
        student_id: student.id,
        subject_id: 'subj1',
        step_unit: 1,
        step_lesson_in_unit: 1,
        review: true,
      }),
    ]

    const report = buildStudentReport(student, subjects, lessons, progress)

    expect(report.subjectRows[0].reviewFlagged).toBe(true)
  })

  it("only considers this student's own progress rows, ignoring other students' rows for the same subject", () => {
    const student = studentRow({ id: 'student1' })
    const subjects = [subjectRow({ id: 'subj1', name: 'Math' })]
    const lessons = [lessonRow({ id: 'l1', subject_id: 'subj1', unit: 1, lesson_in_unit: 1, title: 'Fractions' })]
    const progress = [
      progressRow({
        student_id: 'other-student',
        subject_id: 'subj1',
        step_unit: 1,
        step_lesson_in_unit: 1,
        review: true,
      }),
    ]

    const report = buildStudentReport(student, subjects, lessons, progress)

    expect(report.subjectRows[0].lessonTitle).toBeUndefined()
    expect(report.subjectRows[0].reviewFlagged).toBe(false)
  })

  it('produces one row per subject, in the given subject order', () => {
    const student = studentRow()
    const subjects = [
      subjectRow({ id: 's1', name: 'Math', position: 0 }),
      subjectRow({ id: 's2', name: 'Reading', position: 1 }),
    ]

    const report = buildStudentReport(student, subjects, [], [])

    expect(report.subjectRows.map((row) => row.subject.name)).toEqual(['Math', 'Reading'])
  })
})
