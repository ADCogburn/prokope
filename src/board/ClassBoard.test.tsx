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
  onCurriculumNavigate?: (id: string) => void
  onReportNavigate?: () => void
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
      onCurriculumNavigate={props.onCurriculumNavigate ?? vi.fn()}
      onReportNavigate={props.onReportNavigate ?? vi.fn()}
    />,
  )
}

describe('ClassBoard', () => {
  it('shows only the add-subject card when the class has no subjects', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    renderBoard({
      classRow,
      subjects: [],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: undefined,
    })

    expect(screen.getByRole('button', { name: '+ Add subject' })).toBeInTheDocument()
    expect(screen.queryByText('No subjects yet.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Go to/ })).not.toBeInTheDocument()
  })

  it('creates the first subject from the zero-subjects add-card and persists it', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    renderBoard({
      classRow,
      subjects: [],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: undefined,
    })

    fireEvent.click(screen.getByRole('button', { name: '+ Add subject' }))
    fireEvent.change(screen.getByLabelText('Subject name'), { target: { value: 'Science' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(async () => {
      const rows = await db.subject.where('class_id').equals(classRow.id).toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ name: 'Science', position: 0 })
    })
  })

  it('creates a new subject from the trailing add-card, appended at the end', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subjectA = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const subjectB = await createSubject({ class_id: classRow.id, name: 'Reading', position: 1 })

    renderBoard({
      classRow,
      subjects: [subjectA, subjectB],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: subjectA.id,
    })

    fireEvent.click(screen.getByRole('button', { name: '+ Add subject' }))
    fireEvent.change(screen.getByLabelText('Subject name'), { target: { value: 'Science' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(async () => {
      const rows = await db.subject.where('class_id').equals(classRow.id).toArray()
      const science = rows.find((row) => row.name === 'Science')
      expect(science?.position).toBe(2)
    })
  })

  it('cancelling the add-subject form collapses it back to the "+" card without creating a subject', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderBoard({
      classRow,
      subjects: [subject],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: subject.id,
    })

    fireEvent.click(screen.getByRole('button', { name: '+ Add subject' }))
    fireEvent.change(screen.getByLabelText('Subject name'), { target: { value: 'Science' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: '+ Add subject' })).toBeInTheDocument()
    const rows = await db.subject.where('class_id').equals(classRow.id).toArray()
    expect(rows).toHaveLength(1)
  })

  it('shows "This Subject is empty." and a curriculum-navigation link instead of the student list when the panel has zero lessons', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const student = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })
    const onCurriculumNavigate = vi.fn()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [],
      lessons: [],
      activeSubjectId: subject.id,
      onCurriculumNavigate,
    })

    expect(screen.getByText('This Subject is empty.')).toBeInTheDocument()
    // Emily still appears in the always-present left-hand student roster --
    // it's her per-subject progress cell that should be gone.
    expect(screen.queryByRole('button', { name: 'Flag for review' })).not.toBeInTheDocument()
    expect(screen.queryByText('Not started')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ Add lessons' }))

    expect(onCurriculumNavigate).toHaveBeenCalledWith(subject.id)
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

  it('wires up SubjectReorder: clicking its pencil swaps the dots for that subject\'s name chips', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subjectA = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const subjectB = await createSubject({ class_id: classRow.id, name: 'Reading', position: 1 })

    renderBoard({
      classRow,
      subjects: [subjectA, subjectB],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: subjectA.id,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reorder subjects' }))

    expect(screen.getByText('Math', { selector: '.subject-reorder__chip-name' })).toBeInTheDocument()
    expect(screen.getByText('Reading', { selector: '.subject-reorder__chip-name' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Go to Math' })).not.toBeInTheDocument()
  })

  it('hides both carousel arrows when there is only one subject', async () => {
    const { classRow, subject } = await seedClassWithOneSubjectOneStudent()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: subject.id,
    })

    expect(screen.queryByRole('button', { name: 'Previous subject' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next subject' })).not.toBeInTheDocument()
  })

  it('hides the previous arrow on the first subject and the next arrow on the last, showing the other', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subjectA = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const subjectB = await createSubject({ class_id: classRow.id, name: 'Reading', position: 1 })

    renderBoard({
      classRow,
      subjects: [subjectA, subjectB],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: subjectA.id,
    })

    expect(screen.queryByRole('button', { name: 'Previous subject' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next subject' })).toBeInTheDocument()
  })

  it('clicking the next arrow advances to the next subject and calls onSubjectChange', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Next subject' }))

    await waitFor(() => expect(onSubjectChange).toHaveBeenCalledWith(subjectB.id))
    expect(screen.queryByRole('button', { name: 'Next subject' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous subject' })).toBeInTheDocument()
  })

  it('clicking the previous arrow returns to the prior subject and calls onSubjectChange', async () => {
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
      activeSubjectId: subjectB.id,
      onSubjectChange,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Previous subject' }))

    await waitFor(() => expect(onSubjectChange).toHaveBeenCalledWith(subjectA.id))
  })

  it('wires up the book icon: menu -> SubjectPickerModal -> curriculum navigation, closing the modal', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subjectA = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const subjectB = await createSubject({ class_id: classRow.id, name: 'Reading', position: 1 })
    const onCurriculumNavigate = vi.fn()

    renderBoard({
      classRow,
      subjects: [subjectA, subjectB],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: subjectA.id,
      onCurriculumNavigate,
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add lessons menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add lessons' }))

    const dialog = screen.getByRole('dialog', { name: 'Add lessons' })
    expect(dialog).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reading' }))

    expect(onCurriculumNavigate).toHaveBeenCalledWith(subjectB.id)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('right-click -> "Jump to lesson..." -> picking a lesson moves the student directly to it in the real db', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const student = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })
    const first = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })
    const second = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 2,
      title: 'Decimals',
      description: '',
    })
    const progress = await upsertProgressStep(student.id, subject.id, {
      unit: second.unit,
      lesson_in_unit: second.lesson_in_unit,
    })

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [progress],
      lessons: [first, second],
      activeSubjectId: subject.id,
    })

    fireEvent.contextMenu(screen.getByText('Emily', { selector: '.progress-cell__student' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Jump to lesson...' }))
    fireEvent.click(screen.getByRole('button', { name: '1.1 - Fractions' }))

    await waitFor(async () => {
      const row = await db.progress.where('[student_id+subject_id]').equals([student.id, subject.id]).first()
      expect(row?.step_unit).toBe(1)
      expect(row?.step_lesson_in_unit).toBe(1)
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('right-click -> "Un-advance" steps a student back one lesson in the real db', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const student = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })
    const first = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })
    const second = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 2,
      title: 'Decimals',
      description: '',
    })
    const progress = await upsertProgressStep(student.id, subject.id, {
      unit: second.unit,
      lesson_in_unit: second.lesson_in_unit,
    })

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [progress],
      lessons: [first, second],
      activeSubjectId: subject.id,
    })

    fireEvent.contextMenu(screen.getByText('Emily', { selector: '.progress-cell__student' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Un-advance' }))

    await waitFor(async () => {
      const row = await db.progress.where('[student_id+subject_id]').equals([student.id, subject.id]).first()
      expect(row?.step_unit).toBe(1)
      expect(row?.step_lesson_in_unit).toBe(1)
    })
  })

  it('disables "Un-advance" in the context menu once a student is at {0, 0} "Not started"', async () => {
    const { classRow, subject, student, lesson } = await seedClassWithOneSubjectOneStudent()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [],
      lessons: [lesson],
      activeSubjectId: subject.id,
    })

    fireEvent.contextMenu(screen.getByText('Emily', { selector: '.progress-cell__student' }))

    expect(screen.getByRole('menuitem', { name: 'Un-advance' })).toBeDisabled()
  })

  it('clicking Bulk Advance advances every student in the active subject and skips one already on the last lesson', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const emily = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })
    const sam = await createStudent({ class_id: classRow.id, name: 'Sam', position: 1 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })
    const samProgress = await upsertProgressStep(sam.id, subject.id, {
      unit: lesson.unit,
      lesson_in_unit: lesson.lesson_in_unit,
    })

    renderBoard({
      classRow,
      subjects: [subject],
      students: [emily, sam],
      progress: [samProgress],
      lessons: [lesson],
      activeSubjectId: subject.id,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Bulk Advance' }))

    await waitFor(async () => {
      const emilyRow = await db.progress.where('[student_id+subject_id]').equals([emily.id, subject.id]).first()
      expect(emilyRow?.step_unit).toBe(1)
      expect(emilyRow?.step_lesson_in_unit).toBe(1)
    })
    const samRow = await db.progress.where('[student_id+subject_id]').equals([sam.id, subject.id]).first()
    expect(samRow?.step_hlc).toBe(samProgress.step_hlc)
  })

  it('shows an Undo control after Bulk Advance that reverts every advanced student to their pre-batch position', async () => {
    const { classRow, subject, student, lesson } = await seedClassWithOneSubjectOneStudent()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [],
      lessons: [lesson],
      activeSubjectId: subject.id,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Bulk Advance' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    await waitFor(async () => {
      const row = await db.progress.where('[student_id+subject_id]').equals([student.id, subject.id]).first()
      expect(row?.step_unit).toBe(0)
      expect(row?.step_lesson_in_unit).toBe(0)
    })
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('clears the Undo control once a single-cell edit touches the same subject\'s progress', async () => {
    const { classRow, subject, student, lesson } = await seedClassWithOneSubjectOneStudent()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [],
      lessons: [lesson],
      activeSubjectId: subject.id,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Bulk Advance' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Flag for review' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument())
  })

  it('disables Bulk Advance when the active subject has no lessons', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const student = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [],
      lessons: [],
      activeSubjectId: subject.id,
    })

    expect(screen.getByRole('button', { name: 'Bulk Advance' })).toBeDisabled()
  })

  it('wires up the book icon menu\'s "Generate report" item, closing the menu', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const onReportNavigate = vi.fn()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: subject.id,
      onReportNavigate,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add lessons menu' }))
    expect(screen.getByRole('button', { name: 'Generate report' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Generate report' }))

    expect(onReportNavigate).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Generate report' })).not.toBeInTheDocument()
  })
})
