import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Reports } from './Reports'
import type { ClassRow, LessonRow, ProgressRow, StudentRow, SubjectRow } from '../db/schema'

function classRow(overrides: Partial<ClassRow> = {}): ClassRow {
  return {
    id: 'class1',
    user_id: 'user1',
    name: 'Homeroom',
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

const baseProps = {
  classRow: classRow(),
  subjects: [subjectRow({ id: 's1', name: 'Math' })],
  lessons: [lessonRow({ id: 'l1', subject_id: 's1' })] as LessonRow[],
  progress: [] as ProgressRow[],
}

describe('Reports', () => {
  beforeEach(() => {
    vi.stubGlobal('print', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to the per-student report, batched for every student', () => {
    const students = [studentRow({ id: 'st1', name: 'Emily' }), studentRow({ id: 'st2', name: 'Ben' })]

    render(<Reports {...baseProps} students={students} onBack={vi.fn()} />)

    expect(screen.getByRole('combobox', { name: 'Report type' })).toHaveValue('per-student')
    expect(screen.getByRole('heading', { name: 'Emily' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ben' })).toBeInTheDocument()
  })

  it('narrows the per-student report to one student when picked from the student dropdown', () => {
    const students = [studentRow({ id: 'st1', name: 'Emily' }), studentRow({ id: 'st2', name: 'Ben' })]

    render(<Reports {...baseProps} students={students} onBack={vi.fn()} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Student' }), { target: { value: 'st2' } })

    expect(screen.queryByRole('heading', { name: 'Emily' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ben' })).toBeInTheDocument()
  })

  it('switches to the weekly lesson plan grid and hides the student picker', () => {
    const students = [studentRow({ id: 'st1', name: 'Emily' })]

    render(<Reports {...baseProps} students={students} onBack={vi.fn()} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Report type' }), { target: { value: 'weekly-plan' } })

    expect(screen.getByText('Weekly Lesson Plan Template/Pacing Guide')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Student' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Emily' })).not.toBeInTheDocument()
  })

  it('shows a message instead of a report when the class has no students', () => {
    render(<Reports {...baseProps} students={[]} onBack={vi.fn()} />)

    expect(screen.getByText('No students to report on.')).toBeInTheDocument()
  })

  it('calls onBack when the back button is clicked', () => {
    const onBack = vi.fn()
    render(<Reports {...baseProps} students={[studentRow()]} onBack={onBack} />)

    fireEvent.click(screen.getByRole('button', { name: /Back to board/ }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('calls window.print when the print button is clicked', () => {
    render(<Reports {...baseProps} students={[studentRow()]} onBack={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Print' }))

    expect(window.print).toHaveBeenCalledTimes(1)
  })
})
