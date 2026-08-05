import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ClassBoard } from './ClassBoard'
import { db } from '../db/schema'
import { createClass, createLesson, createStudent, createSubject, upsertProgressStep } from '../db'
import type { ClassRow, LessonRow, ProgressRow, StudentRow, SubjectRow } from '../db/schema'

class MockResizeObserver {
  callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }
  observe() {
    this.callback(
      [{ contentRect: { width: 800 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(db.tables.map((table) => table.clear()))
})

async function seedClassWithOneSubjectOneStudent() {
  const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
  const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
  const student = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })
  const lesson = await createLesson({
    subject_id: subject.id,
    unit: 1,
    lesson_in_unit: 1,
    title: 'Fractions',
    description: '',
  })
  return { classRow, subject, student, lesson }
}

function renderBoard(props: {
  classRow: ClassRow
  subjects: SubjectRow[]
  students: StudentRow[]
  progress: ProgressRow[]
  lessons: LessonRow[]
  activeSubjectId: string | undefined
  onSubjectChange?: (id: string) => void
}) {
  return render(
    <ClassBoard
      classRow={props.classRow}
      subjects={props.subjects}
      students={props.students}
      progress={props.progress}
      lessons={props.lessons}
      activeSubjectId={props.activeSubjectId}
      onSubjectChange={props.onSubjectChange ?? vi.fn()}
    />,
  )
}

describe('ClassBoard', () => {
  it('shows an empty-state message when the class has no subjects', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    renderBoard({
      classRow,
      subjects: [],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: undefined,
    })

    expect(screen.getByText('No subjects yet.')).toBeInTheDocument()
  })

  it("renders the active subject's panel with each student's progress cell", async () => {
    const { classRow, subject, student } = await seedClassWithOneSubjectOneStudent()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [],
      lessons: await db.lesson.toArray(),
      activeSubjectId: subject.id,
    })

    expect(screen.getByText('Math')).toBeInTheDocument()
    expect(screen.getAllByText('Emily').length).toBeGreaterThan(0)
    expect(screen.getByText('Not started')).toBeInTheDocument()
  })

  it('clicking the advance control calls advanceProgress and the row updates in the real db', async () => {
    const { classRow, subject, student, lesson } = await seedClassWithOneSubjectOneStudent()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [],
      lessons: [lesson],
      activeSubjectId: subject.id,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Next lesson' }))

    await waitFor(async () => {
      const row = await db.progress.where('[student_id+subject_id]').equals([student.id, subject.id]).first()
      expect(row?.step_unit).toBe(1)
      expect(row?.step_lesson_in_unit).toBe(1)
    })
  })

  it('disables the advance control once the student is on the last lesson', async () => {
    const { classRow, subject, student, lesson } = await seedClassWithOneSubjectOneStudent()
    const progress = await upsertProgressStep(student.id, subject.id, {
      unit: lesson.unit,
      lesson_in_unit: lesson.lesson_in_unit,
    })

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [progress],
      lessons: [lesson],
      activeSubjectId: subject.id,
    })

    expect(screen.getByRole('button', { name: 'Complete' })).toBeDisabled()
  })

  it('clicking the review toggle flags the row in the real db', async () => {
    const { classRow, subject, student, lesson } = await seedClassWithOneSubjectOneStudent()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [],
      lessons: [lesson],
      activeSubjectId: subject.id,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Flag for review' }))

    await waitFor(async () => {
      const row = await db.progress.where('[student_id+subject_id]').equals([student.id, subject.id]).first()
      expect(row?.review).toBe(true)
    })
  })

  it('calls onSubjectChange with a subject id when a dot is clicked', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subjectA = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const subjectB = await createSubject({ class_id: classRow.id, name: 'Reading', position: 1 })
    const onSubjectChange = vi.fn()

    renderBoard({
      classRow,
      subjects: [subjectA, subjectB],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: subjectA.id,
      onSubjectChange,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Go to Reading' }))

    await waitFor(() => expect(onSubjectChange).toHaveBeenCalledWith(subjectB.id))
  })
})
