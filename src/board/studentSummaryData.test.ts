import { describe, expect, it } from 'vitest'
import type { LessonRow, ProgressRow, ReviewFlagRow, StudentRow, SubjectRow } from '../db/schema'
import { buildStudentSummary } from './studentSummaryData'

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
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function reviewFlagRow(overrides: Partial<ReviewFlagRow> = {}): ReviewFlagRow {
  return {
    id: 'review-flag1',
    student_id: 'student1',
    lesson_id: 'lesson1',
    flagged: true,
    hlc: '',
    client_id: '',
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('buildStudentSummary', () => {
  it('produces one row per subject, in the given subject order, for a student with multiple subjects', () => {
    const student = studentRow()
    const subjects = [
      subjectRow({ id: 's1', name: 'Math', position: 0 }),
      subjectRow({ id: 's2', name: 'Reading', position: 1 }),
    ]

    const summary = buildStudentSummary(student, subjects, [], [], [])

    expect(summary.student).toBe(student)
    expect(summary.subjectRows.map((row) => row.subject.name)).toEqual(['Math', 'Reading'])
  })

  it('marks hasLessons false for a subject with no lessons defined at all', () => {
    const student = studentRow()
    const subjects = [subjectRow({ id: 'subj1', name: 'Math' })]

    const summary = buildStudentSummary(student, subjects, [], [], [])

    expect(summary.subjectRows[0]).toEqual({
      subject: subjects[0],
      lessonLabel: undefined,
      hasLessons: false,
      reviewFlagged: false,
    })
  })

  it('reports "not started" (no lesson label) for a subject with lessons but no progress row yet', () => {
    const student = studentRow()
    const subjects = [subjectRow({ id: 'subj1', name: 'Math' })]
    const lessons = [lessonRow({ id: 'l1', subject_id: 'subj1' })]

    const summary = buildStudentSummary(student, subjects, lessons, [], [])

    expect(summary.subjectRows[0]).toEqual({
      subject: subjects[0],
      lessonLabel: undefined,
      hasLessons: true,
      reviewFlagged: false,
    })
  })

  it("shows the current lesson's unit/lesson number and title for a subject the student has progress in", () => {
    const student = studentRow()
    const subjects = [subjectRow({ id: 'subj1', name: 'Math' })]
    const lessons = [lessonRow({ id: 'l1', subject_id: 'subj1', unit: 1, lesson_in_unit: 1, title: 'Fractions' })]
    const progress = [
      progressRow({ student_id: student.id, subject_id: 'subj1', step_unit: 1, step_lesson_in_unit: 1 }),
    ]

    const summary = buildStudentSummary(student, subjects, lessons, progress, [])

    expect(summary.subjectRows[0]).toEqual({
      subject: subjects[0],
      lessonLabel: '1.1 - Fractions',
      hasLessons: true,
      reviewFlagged: false,
    })
  })

  it('carries the review flag through when the current lesson has a flagged ReviewFlag row (#152/ADR-0011)', () => {
    const student = studentRow()
    const subjects = [subjectRow({ id: 'subj1', name: 'Math' })]
    const lessons = [lessonRow({ id: 'l1', subject_id: 'subj1', unit: 1, lesson_in_unit: 1, title: 'Fractions' })]
    const progress = [
      progressRow({ student_id: student.id, subject_id: 'subj1', step_unit: 1, step_lesson_in_unit: 1 }),
    ]
    const reviewFlags = [reviewFlagRow({ student_id: student.id, lesson_id: 'l1', flagged: true })]

    const summary = buildStudentSummary(student, subjects, lessons, progress, reviewFlags)

    expect(summary.subjectRows[0].reviewFlagged).toBe(true)
  })

  it('does not show a review flag for a lesson other than the current one', () => {
    const student = studentRow()
    const subjects = [subjectRow({ id: 'subj1', name: 'Math' })]
    const lessons = [
      lessonRow({ id: 'l1', subject_id: 'subj1', unit: 1, lesson_in_unit: 1, title: 'Fractions' }),
      lessonRow({ id: 'l2', subject_id: 'subj1', unit: 1, lesson_in_unit: 2, title: 'Decimals' }),
    ]
    const progress = [
      progressRow({ student_id: student.id, subject_id: 'subj1', step_unit: 1, step_lesson_in_unit: 1 }),
    ]
    // Flag is on l2 (not the student's current lesson, l1) -- interim
    // current-lesson-only behavior per #152 should not surface it here.
    const reviewFlags = [reviewFlagRow({ student_id: student.id, lesson_id: 'l2', flagged: true })]

    const summary = buildStudentSummary(student, subjects, lessons, progress, reviewFlags)

    expect(summary.subjectRows[0].reviewFlagged).toBe(false)
  })

  it('does not show a review flag whose flagged field is false', () => {
    const student = studentRow()
    const subjects = [subjectRow({ id: 'subj1', name: 'Math' })]
    const lessons = [lessonRow({ id: 'l1', subject_id: 'subj1', unit: 1, lesson_in_unit: 1, title: 'Fractions' })]
    const progress = [
      progressRow({ student_id: student.id, subject_id: 'subj1', step_unit: 1, step_lesson_in_unit: 1 }),
    ]
    const reviewFlags = [reviewFlagRow({ student_id: student.id, lesson_id: 'l1', flagged: false })]

    const summary = buildStudentSummary(student, subjects, lessons, progress, reviewFlags)

    expect(summary.subjectRows[0].reviewFlagged).toBe(false)
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
      }),
    ]
    const reviewFlags = [reviewFlagRow({ student_id: 'other-student', lesson_id: 'l1', flagged: true })]

    const summary = buildStudentSummary(student, subjects, lessons, progress, reviewFlags)

    expect(summary.subjectRows[0].lessonLabel).toBeUndefined()
    expect(summary.subjectRows[0].reviewFlagged).toBe(false)
  })
})
