import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ClassBoard } from './ClassBoard'
import { db } from '../db/schema'
import {
  createClass,
  createLesson,
  createStudent,
  createSubject,
  listStudentsForClass,
  saveSubjectTemplate,
  upsertProgressStep,
  upsertReviewFlag,
} from '../db'
import type { ClassRow, LessonRow, ProgressRow, ReviewFlagRow, StudentRow, SubjectRow } from '../db/schema'

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
  reviewFlags?: ReviewFlagRow[]
  lessons: LessonRow[]
  activeSubjectId: string | undefined
  onSubjectChange?: (id: string) => void
  onCurriculumNavigate?: (id: string) => void
  onReportNavigate?: () => void
  onStudentNavigate?: (id: string) => void
}) {
  return render(
    <ClassBoard
      classRow={props.classRow}
      subjects={props.subjects}
      students={props.students}
      progress={props.progress}
      reviewFlags={props.reviewFlags ?? []}
      lessons={props.lessons}
      activeSubjectId={props.activeSubjectId}
      onSubjectChange={props.onSubjectChange ?? vi.fn()}
      onCurriculumNavigate={props.onCurriculumNavigate ?? vi.fn()}
      onReportNavigate={props.onReportNavigate ?? vi.fn()}
      onStudentNavigate={props.onStudentNavigate ?? vi.fn()}
    />,
  )
}

describe('ClassBoard', () => {
  it('shows the add-subject card and the student roster (with its own add-student card) when the class has no subjects', async () => {
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
    expect(screen.getByRole('button', { name: '+ Add student' })).toBeInTheDocument()
    expect(screen.getByText('No students yet.')).toBeInTheDocument()
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

  async function makeSubjectTemplateForUser(userId: string, templateName: string) {
    const templateClass = await createClass({ user_id: userId, name: 'Template Source Class' })
    const templateSubject = await createSubject({
      class_id: templateClass.id,
      name: 'Template Source Subject',
      position: 0,
    })
    await createLesson({
      subject_id: templateSubject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Intro',
      description: 'Intro lesson',
    })
    await createLesson({
      subject_id: templateSubject.id,
      unit: 1,
      lesson_in_unit: 2,
      title: 'Next up',
      description: 'Second lesson',
    })
    return saveSubjectTemplate(templateSubject.id, templateName)
  }

  it('offers "Start from scratch" vs. "Start from a Template" on the add-subject form, defaulting to scratch', async () => {
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

    expect(screen.getByRole('radio', { name: 'Start from scratch' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Start from a Template' })).not.toBeChecked()
    expect(screen.queryByLabelText('Template')).not.toBeInTheDocument()
  })

  it('choosing "Start from a Template" lists every Subject Template the teacher has ever saved', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const template = await makeSubjectTemplateForUser('user-1', 'Math Basics')

    renderBoard({
      classRow,
      subjects: [],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: undefined,
    })

    fireEvent.click(screen.getByRole('button', { name: '+ Add subject' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Start from a Template' }))

    await waitFor(() => {
      expect(screen.getByRole('option', { name: template.name })).toBeInTheDocument()
    })
  })

  it('selecting a Template prefills the subject name field, which stays editable', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const template = await makeSubjectTemplateForUser('user-1', 'Math Basics')

    renderBoard({
      classRow,
      subjects: [],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: undefined,
    })

    fireEvent.click(screen.getByRole('button', { name: '+ Add subject' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Start from a Template' }))

    await waitFor(() => screen.getByLabelText('Template'))
    fireEvent.change(screen.getByLabelText('Template'), { target: { value: template.id } })

    expect(screen.getByLabelText('Subject name')).toHaveValue('Math Basics')

    fireEvent.change(screen.getByLabelText('Subject name'), { target: { value: 'Math Basics (Room 5)' } })
    expect(screen.getByLabelText('Subject name')).toHaveValue('Math Basics (Room 5)')
  })

  it('submitting in Template mode creates the Subject and populates its Lessons from the Template', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const template = await makeSubjectTemplateForUser('user-1', 'Math Basics')

    renderBoard({
      classRow,
      subjects: [],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: undefined,
    })

    fireEvent.click(screen.getByRole('button', { name: '+ Add subject' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Start from a Template' }))

    await waitFor(() => screen.getByLabelText('Template'))
    fireEvent.change(screen.getByLabelText('Template'), { target: { value: template.id } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    let newSubjectId = ''
    await waitFor(async () => {
      const rows = await db.subject.where('class_id').equals(classRow.id).toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ name: 'Math Basics', position: 0 })
      newSubjectId = rows[0].id
    })

    // applySubjectTemplate resolves after createSubject, in the same submit
    // handler -- wait for the Lessons to land rather than asserting
    // immediately, the same way the subject-creation check above retries.
    await waitFor(async () => {
      const lessons = await db.lesson.where('subject_id').equals(newSubjectId).toArray()
      expect(lessons).toHaveLength(2)
    })

    const lessons = (await db.lesson.where('subject_id').equals(newSubjectId).toArray()).sort(
      (a, b) => a.unit - b.unit || a.lesson_in_unit - b.lesson_in_unit,
    )
    expect(lessons[0]).toMatchObject({ unit: 1, lesson_in_unit: 1, title: 'Intro', description: 'Intro lesson' })
    expect(lessons[1]).toMatchObject({
      unit: 1,
      lesson_in_unit: 2,
      title: 'Next up',
      description: 'Second lesson',
    })

    // The card clears and collapses after a successful add, same as "start
    // from scratch" -- this only settles once reset()/collapse() run after
    // applySubjectTemplate resolves, so it needs its own wait too.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+ Add subject' })).toBeInTheDocument()
    })
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

  it('clicking the review toggle flags the student\'s current lesson via ReviewFlag (#152/ADR-0011)', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Flag for review' }))

    await waitFor(async () => {
      const row = await db.review_flag
        .where('[student_id+lesson_id]')
        .equals([student.id, lesson.id])
        .first()
      expect(row?.flagged).toBe(true)
    })
  })

  it('the review toggle is a no-op when the student has no current lesson yet (Not started)', async () => {
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

    // No lesson occupies the {0,0} "Not started" position, so there's
    // nothing to flag yet -- the click must not create any ReviewFlag row.
    expect(await db.review_flag.count()).toBe(0)
  })

  it("reflects the current lesson's ReviewFlag state on the Progress Cell toggle, not a flag on a different lesson", async () => {
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
      unit: first.unit,
      lesson_in_unit: first.lesson_in_unit,
    })
    const reviewFlag = await upsertReviewFlag(student.id, second.id, true)

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [progress],
      reviewFlags: [reviewFlag],
      lessons: [first, second],
      activeSubjectId: subject.id,
    })

    // Flagged lesson is `second`, but the student's current lesson is
    // `first` -- the quick-toggle only ever reflects the current lesson.
    expect(screen.getByRole('button', { name: 'Flag for review' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove review flag' })).not.toBeInTheDocument()
  })

  it('shows "N lessons marked for review" in the roster, summed across every subject (#152/ADR-0011)', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const math = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const reading = await createSubject({ class_id: classRow.id, name: 'Reading', position: 1 })
    const student = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })
    const mathLesson = await createLesson({
      subject_id: math.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })
    const readingLesson = await createLesson({
      subject_id: reading.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Phonics',
      description: '',
    })
    const mathFlag = await upsertReviewFlag(student.id, mathLesson.id, true)
    const readingFlag = await upsertReviewFlag(student.id, readingLesson.id, true)

    renderBoard({
      classRow,
      subjects: [math, reading],
      students: [student],
      progress: [],
      reviewFlags: [mathFlag, readingFlag],
      lessons: [mathLesson, readingLesson],
      activeSubjectId: math.id,
    })

    expect(screen.getByText('2 lessons marked for review')).toBeInTheDocument()
  })

  it('shows the singular "1 lesson marked for review" for exactly one flagged lesson', async () => {
    const { classRow, subject, student, lesson } = await seedClassWithOneSubjectOneStudent()
    const reviewFlag = await upsertReviewFlag(student.id, lesson.id, true)

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [],
      reviewFlags: [reviewFlag],
      lessons: [lesson],
      activeSubjectId: subject.id,
    })

    expect(screen.getByText('1 lesson marked for review')).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: 'Curriculum Page' }))

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

  it('right-click -> "Review other lessons" opens the checklist modal, distinct from "Jump to lesson..." (#153)', async () => {
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

    expect(screen.getByRole('menuitem', { name: 'Jump to lesson...' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Review other lessons' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Review other lessons' }))

    const dialog = screen.getByRole('dialog', { name: 'Mark lessons for review for Emily' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: '1.1 - Fractions' })).toBeInTheDocument()
  })

  it('lists every lesson in the subject, including ones ahead of the student\'s current position, each checkable', async () => {
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
    // Student's current position is `first` -- `second` is ahead of them.
    const progress = await upsertProgressStep(student.id, subject.id, {
      unit: first.unit,
      lesson_in_unit: first.lesson_in_unit,
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
    fireEvent.click(screen.getByRole('menuitem', { name: 'Review other lessons' }))

    const dialog = screen.getByRole('dialog', { name: 'Mark lessons for review for Emily' })
    expect(within(dialog).getByRole('checkbox', { name: '1.1 - Fractions' })).toBeInTheDocument()
    const aheadCheckbox = within(dialog).getByRole('checkbox', { name: '1.2 - Decimals' })
    expect(aheadCheckbox).toBeInTheDocument()
    expect(aheadCheckbox).toBeEnabled()
  })

  it('checking a lesson in "Review other lessons" flags it via ReviewFlag without changing the student\'s position', async () => {
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

    fireEvent.contextMenu(screen.getByText('Emily', { selector: '.progress-cell__student' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Review other lessons' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '1.1 - Fractions' }))

    await waitFor(async () => {
      const row = await db.review_flag
        .where('[student_id+lesson_id]')
        .equals([student.id, lesson.id])
        .first()
      expect(row?.flagged).toBe(true)
    })

    // Position is untouched.
    const positionRow = await db.progress.where('[student_id+subject_id]').equals([student.id, subject.id]).first()
    expect(positionRow?.step_unit).toBe(lesson.unit)
    expect(positionRow?.step_lesson_in_unit).toBe(lesson.lesson_in_unit)
  })

  it('unchecking an already-flagged lesson in "Review other lessons" unflags it without changing position', async () => {
    const { classRow, subject, student, lesson } = await seedClassWithOneSubjectOneStudent()
    const progress = await upsertProgressStep(student.id, subject.id, {
      unit: lesson.unit,
      lesson_in_unit: lesson.lesson_in_unit,
    })
    const reviewFlag = await upsertReviewFlag(student.id, lesson.id, true)

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [progress],
      reviewFlags: [reviewFlag],
      lessons: [lesson],
      activeSubjectId: subject.id,
    })

    fireEvent.contextMenu(screen.getByText('Emily', { selector: '.progress-cell__student' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Review other lessons' }))

    const checkbox = screen.getByRole('checkbox', { name: '1.1 - Fractions' })
    expect(checkbox).toBeChecked()

    fireEvent.click(checkbox)

    await waitFor(async () => {
      const row = await db.review_flag
        .where('[student_id+lesson_id]')
        .equals([student.id, lesson.id])
        .first()
      expect(row?.flagged).toBe(false)
    })

    const positionRow = await db.progress.where('[student_id+subject_id]').equals([student.id, subject.id]).first()
    expect(positionRow?.step_unit).toBe(lesson.unit)
    expect(positionRow?.step_lesson_in_unit).toBe(lesson.lesson_in_unit)
  })

  it('flagging a lesson ahead of the student\'s current position via "Review other lessons" does not move them there', async () => {
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
      unit: first.unit,
      lesson_in_unit: first.lesson_in_unit,
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
    fireEvent.click(screen.getByRole('menuitem', { name: 'Review other lessons' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '1.2 - Decimals' }))

    await waitFor(async () => {
      const row = await db.review_flag.where('[student_id+lesson_id]').equals([student.id, second.id]).first()
      expect(row?.flagged).toBe(true)
    })

    // The student's position is still `first`, not `second`.
    const positionRow = await db.progress.where('[student_id+subject_id]').equals([student.id, subject.id]).first()
    expect(positionRow?.step_unit).toBe(first.unit)
    expect(positionRow?.step_lesson_in_unit).toBe(first.lesson_in_unit)
  })

  it('scopes "Review other lessons" to the one student+subject whose cell was right-clicked, with no cross-subject or cross-student leakage', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const math = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const reading = await createSubject({ class_id: classRow.id, name: 'Reading', position: 1 })
    const emily = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })
    const sam = await createStudent({ class_id: classRow.id, name: 'Sam', position: 1 })
    const mathLesson = await createLesson({
      subject_id: math.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })
    const readingLesson = await createLesson({
      subject_id: reading.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Phonics',
      description: '',
    })

    renderBoard({
      classRow,
      subjects: [math, reading],
      students: [emily, sam],
      progress: [],
      lessons: [mathLesson, readingLesson],
      activeSubjectId: math.id,
    })

    const mathPanel = screen.getByText('Math').closest('.class-board__panel') as HTMLElement
    const emilyInMath = within(mathPanel)
      .getByText('Emily', { selector: '.progress-cell__student' })

    fireEvent.contextMenu(emilyInMath)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Review other lessons' }))

    const dialog = screen.getByRole('dialog', { name: 'Mark lessons for review for Emily' })
    // Only Math's one lesson shows -- not Reading's, and not another
    // student's flags.
    expect(within(dialog).getByRole('checkbox', { name: '1.1 - Fractions' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox', { name: '1.1 - Phonics' })).not.toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('checkbox', { name: '1.1 - Fractions' }))

    await waitFor(async () => {
      const row = await db.review_flag
        .where('[student_id+lesson_id]')
        .equals([emily.id, mathLesson.id])
        .first()
      expect(row?.flagged).toBe(true)
    })

    // Sam has no ReviewFlag rows at all -- flagging Emily's lesson didn't
    // leak to him.
    const samFlags = await db.review_flag.where('student_id').equals(sam.id).toArray()
    expect(samFlags).toHaveLength(0)
  })

  it('a real right-click sequence (pointer-down with the right button, then contextmenu) on a Progress Cell opens its menu without engaging the carousel drag state', async () => {
    const { classRow, subject, student, lesson } = await seedClassWithOneSubjectOneStudent()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [],
      lessons: [lesson],
      activeSubjectId: subject.id,
    })

    const studentName = screen.getByText('Emily', { selector: '.progress-cell__student' })

    fireEvent.pointerDown(studentName, { button: 2, pointerId: 1, clientX: 100 })
    fireEvent.contextMenu(studentName)

    expect(screen.getByRole('menuitem', { name: 'Jump to lesson...' })).toBeInTheDocument()
    expect(document.querySelector('.class-board__carousel--dragging')).not.toBeInTheDocument()
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

    const view = renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [],
      lessons: [lesson],
      activeSubjectId: subject.id,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Bulk Advance' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument())

    // ClassBoard is a controlled/presentational component (fed by a live
    // query in the real app) -- simulate the next render a teacher would
    // actually see once that query re-fires with Bulk Advance's write, so
    // the review toggle (which now targets the *current lesson*, #152/
    // ADR-0011) has one to target.
    const advanced = await db.progress.where('[student_id+subject_id]').equals([student.id, subject.id]).first()
    view.rerender(
      <ClassBoard
        classRow={classRow}
        subjects={[subject]}
        students={[student]}
        progress={[advanced!]}
        reviewFlags={[]}
        lessons={[lesson]}
        activeSubjectId={subject.id}
        onSubjectChange={vi.fn()}
        onCurriculumNavigate={vi.fn()}
        onReportNavigate={vi.fn()}
        onStudentNavigate={vi.fn()}
      />,
    )

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

  it('wires up the book icon menu\'s "Save Class Template" item: opens a name form prefilled with the class name', async () => {
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

    expect(screen.queryByLabelText('Template name')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add lessons menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Class Template' }))

    expect(screen.queryByRole('button', { name: 'Save Class Template' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Template name')).toHaveValue('Homeroom')
  })

  it('submitting the prefilled template name persists a class_template row (and its subject/lesson rows)', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })

    renderBoard({
      classRow,
      subjects: [subject],
      students: [],
      progress: [],
      lessons: [lesson],
      activeSubjectId: subject.id,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add lessons menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Class Template' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(async () => {
      const rows = await db.class_template.where('user_id').equals('user-1').toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ name: 'Homeroom' })
    })

    const template = (await db.class_template.where('user_id').equals('user-1').toArray())[0]!
    const templateSubjects = await db.class_template_subject
      .where('class_template_id')
      .equals(template.id)
      .toArray()
    expect(templateSubjects).toHaveLength(1)
    expect(templateSubjects[0]).toMatchObject({ name: 'Math', position: 0 })

    const templateLessons = await db.class_template_lesson
      .where('class_template_subject_id')
      .equals(templateSubjects[0]!.id)
      .toArray()
    expect(templateLessons).toHaveLength(1)
    expect(templateLessons[0]).toMatchObject({ title: 'Fractions', unit: 1, lesson_in_unit: 1 })

    expect(screen.queryByLabelText('Template name')).not.toBeInTheDocument()
  })

  it('submitting an edited template name persists that edited name', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Add lessons menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Class Template' }))
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'End of year snapshot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(async () => {
      const rows = await db.class_template.where('user_id').equals('user-1').toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ name: 'End of year snapshot' })
    })
    expect(screen.queryByLabelText('Template name')).not.toBeInTheDocument()
  })

  it('cancelling the Save Class Template form closes it without persisting anything', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Add lessons menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Class Template' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByLabelText('Template name')).not.toBeInTheDocument()
    const rows = await db.class_template.where('user_id').equals('user-1').toArray()
    expect(rows).toHaveLength(0)
  })

  it('clicking "+ Add student" reveals the inline form', async () => {
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

    expect(screen.queryByLabelText('Student name')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ Add student' }))

    expect(screen.getByLabelText('Student name')).toBeInTheDocument()
  })

  it('creates a student from the add-student card, appended at the end, showing up in the roster and every subject panel at "Not started"', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subjectA = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const subjectB = await createSubject({ class_id: classRow.id, name: 'Reading', position: 1 })
    const sam = await createStudent({ class_id: classRow.id, name: 'Sam', position: 0 })
    const lessonA = await createLesson({
      subject_id: subjectA.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })
    const lessonB = await createLesson({
      subject_id: subjectB.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Phonics',
      description: '',
    })

    const view = renderBoard({
      classRow,
      subjects: [subjectA, subjectB],
      students: [sam],
      progress: [],
      lessons: [lessonA, lessonB],
      activeSubjectId: subjectA.id,
    })

    fireEvent.click(screen.getByRole('button', { name: '+ Add student' }))
    fireEvent.change(screen.getByLabelText('Student name'), { target: { value: 'Emily' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    let allStudents: StudentRow[] = []
    await waitFor(async () => {
      allStudents = await listStudentsForClass(classRow.id)
      const emily = allStudents.find((row) => row.name === 'Emily')
      expect(emily).toBeDefined()
      expect(emily?.position).toBe(1)
    })

    // The add-student card clears and collapses after a successful add.
    expect(screen.queryByLabelText('Student name')).not.toBeInTheDocument()

    // ClassBoard is a controlled/presentational component fed by a live
    // query in the real app (ClassBoardRoute) -- simulate the next render a
    // teacher would actually see once that query re-fires with the new row.
    view.rerender(
      <ClassBoard
        classRow={classRow}
        subjects={[subjectA, subjectB]}
        students={allStudents}
        progress={[]}
        reviewFlags={[]}
        lessons={[lessonA, lessonB]}
        activeSubjectId={subjectA.id}
        onSubjectChange={vi.fn()}
        onCurriculumNavigate={vi.fn()}
        onReportNavigate={vi.fn()}
        onStudentNavigate={vi.fn()}
      />,
    )

    expect(screen.getByText('Emily', { selector: '.class-board__student-name' })).toBeInTheDocument()

    const mathPanel = screen.getByText('Math').closest('.class-board__panel') as HTMLElement
    const readingPanel = screen.getByText('Reading').closest('.class-board__panel') as HTMLElement
    const emilyInMath = within(mathPanel)
      .getByText('Emily', { selector: '.progress-cell__student' })
      .closest('.progress-cell') as HTMLElement
    const emilyInReading = within(readingPanel)
      .getByText('Emily', { selector: '.progress-cell__student' })
      .closest('.progress-cell') as HTMLElement
    expect(within(emilyInMath).getByText('Not started')).toBeInTheDocument()
    expect(within(emilyInReading).getByText('Not started')).toBeInTheDocument()
  })

  it('submitting a blank or whitespace-only student name is rejected', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: '+ Add student' }))
    const input = screen.getByLabelText('Student name')
    fireEvent.change(input, { target: { value: '   ' } })

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    fireEvent.submit(input.closest('form')!)

    const rows = await db.student.where('class_id').equals(classRow.id).toArray()
    expect(rows).toHaveLength(0)
    expect(screen.getByLabelText('Student name')).toBeInTheDocument()
  })

  it('cancelling the add-student form collapses it back to the "+" card without creating a student', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: '+ Add student' }))
    fireEvent.change(screen.getByLabelText('Student name'), { target: { value: 'Emily' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: '+ Add student' })).toBeInTheDocument()
    const rows = await db.student.where('class_id').equals(classRow.id).toArray()
    expect(rows).toHaveLength(0)
  })

  it('adds a student to a class with no subjects yet, from the empty-state roster', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    renderBoard({
      classRow,
      subjects: [],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: undefined,
    })

    fireEvent.click(screen.getByRole('button', { name: '+ Add student' }))
    fireEvent.change(screen.getByLabelText('Student name'), { target: { value: 'Emily' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(async () => {
      const rows = await db.student.where('class_id').equals(classRow.id).toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ name: 'Emily', position: 0 })
    })
  })

  it('right-clicking a student row opens the menu with "Remove student"', async () => {
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

    fireEvent.contextMenu(screen.getByText('Emily', { selector: '.class-board__student-name' }))

    expect(screen.getByRole('menuitem', { name: 'Remove student' })).toBeInTheDocument()
  })

  it('selecting "Remove student" opens a confirmation dialog naming that student', async () => {
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

    fireEvent.contextMenu(screen.getByText('Emily', { selector: '.class-board__student-name' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove student' }))

    const dialog = screen.getByRole('dialog', { name: 'Remove student' })
    expect(within(dialog).getByText('Remove Emily?')).toBeInTheDocument()

    const rows = await db.student.where('class_id').equals(classRow.id).toArray()
    expect(rows[0].deleted_at).toBeNull()
  })

  it('confirming removal soft-deletes the student, taking them out of a rerendered roster and every subject\'s progress grid', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const student = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })
    const other = await createStudent({ class_id: classRow.id, name: 'Sam', position: 1 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })

    const view = renderBoard({
      classRow,
      subjects: [subject],
      students: [student, other],
      progress: [],
      lessons: [lesson],
      activeSubjectId: subject.id,
    })

    fireEvent.contextMenu(screen.getByText('Emily', { selector: '.class-board__student-name' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove student' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove student' }))

    await waitFor(async () => {
      const row = await db.student.get(student.id)
      expect(row?.deleted_at).not.toBeNull()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Sam is untouched by Emily's removal.
    const samRow = await db.student.get(other.id)
    expect(samRow?.deleted_at).toBeNull()

    const remaining = await listStudentsForClass(classRow.id)
    view.rerender(
      <ClassBoard
        classRow={classRow}
        subjects={[subject]}
        students={remaining}
        progress={[]}
        reviewFlags={[]}
        lessons={[lesson]}
        activeSubjectId={subject.id}
        onSubjectChange={vi.fn()}
        onCurriculumNavigate={vi.fn()}
        onReportNavigate={vi.fn()}
        onStudentNavigate={vi.fn()}
      />,
    )

    expect(screen.queryByText('Emily')).not.toBeInTheDocument()
    expect(screen.getByText('Sam', { selector: '.class-board__student-name' })).toBeInTheDocument()
  })

  it('a backdrop click on the removal confirmation dialog closes it without touching the database', async () => {
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

    fireEvent.contextMenu(screen.getByText('Emily', { selector: '.class-board__student-name' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove student' }))
    fireEvent.click(screen.getByRole('dialog').parentElement!)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const row = await db.student.get(student.id)
    expect(row?.deleted_at).toBeNull()
  })

  it('pressing Escape on the removal confirmation dialog closes it without touching the database', async () => {
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

    fireEvent.contextMenu(screen.getByText('Emily', { selector: '.class-board__student-name' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove student' }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const row = await db.student.get(student.id)
    expect(row?.deleted_at).toBeNull()
  })

  it('right-clicking the class name heading opens the menu with "Rename class"', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    renderBoard({
      classRow,
      subjects: [],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: undefined,
    })

    fireEvent.contextMenu(screen.getByText('Homeroom'))

    expect(screen.getByRole('menuitem', { name: 'Rename class' })).toBeInTheDocument()
  })

  it('selecting "Rename class" reveals an inline input pre-filled with the current name', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    renderBoard({
      classRow,
      subjects: [],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: undefined,
    })

    fireEvent.contextMenu(screen.getByText('Homeroom'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename class' }))

    expect(screen.getByLabelText('Class name')).toHaveValue('Homeroom')
  })

  it('submitting a new class name calls renameClass and persists it', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    renderBoard({
      classRow,
      subjects: [],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: undefined,
    })

    fireEvent.contextMenu(screen.getByText('Homeroom'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename class' }))
    const input = screen.getByLabelText('Class name')
    fireEvent.change(input, { target: { value: 'Room 12' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(async () => {
      const row = await db.class.get(classRow.id)
      expect(row?.name).toBe('Room 12')
    })
  })

  it('submitting a blank class name is rejected', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    renderBoard({
      classRow,
      subjects: [],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: undefined,
    })

    fireEvent.contextMenu(screen.getByText('Homeroom'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename class' }))
    const input = screen.getByLabelText('Class name')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.closest('form')!)

    const row = await db.class.get(classRow.id)
    expect(row?.name).toBe('Homeroom')
    expect(screen.getByLabelText('Class name')).toBeInTheDocument()
  })

  it('pressing Escape discards the in-progress class rename without writing', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    renderBoard({
      classRow,
      subjects: [],
      students: [],
      progress: [],
      lessons: [],
      activeSubjectId: undefined,
    })

    fireEvent.contextMenu(screen.getByText('Homeroom'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename class' }))
    const input = screen.getByLabelText('Class name')
    fireEvent.change(input, { target: { value: 'Room 12' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByLabelText('Class name')).not.toBeInTheDocument()
    expect(screen.getByText('Homeroom')).toBeInTheDocument()
    const row = await db.class.get(classRow.id)
    expect(row?.name).toBe('Homeroom')
  })

  it('right-clicking a subject panel header opens the menu with "Rename subject"', async () => {
    const { classRow, subject } = await seedClassWithOneSubjectOneStudent()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [],
      progress: [],
      lessons: await db.lesson.toArray(),
      activeSubjectId: subject.id,
    })

    fireEvent.contextMenu(screen.getByText('Math'))

    expect(screen.getByRole('menuitem', { name: 'Rename subject' })).toBeInTheDocument()
  })

  it('renaming a subject from the board panel header calls renameSubject and persists it', async () => {
    const { classRow, subject } = await seedClassWithOneSubjectOneStudent()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [],
      progress: [],
      lessons: await db.lesson.toArray(),
      activeSubjectId: subject.id,
    })

    fireEvent.contextMenu(screen.getByText('Math'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename subject' }))
    const input = screen.getByLabelText('Subject name')
    fireEvent.change(input, { target: { value: 'Algebra' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(async () => {
      const row = await db.subject.get(subject.id)
      expect(row?.name).toBe('Algebra')
    })
  })

  it('submitting a blank subject name from the board panel header is rejected', async () => {
    const { classRow, subject } = await seedClassWithOneSubjectOneStudent()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [],
      progress: [],
      lessons: await db.lesson.toArray(),
      activeSubjectId: subject.id,
    })

    fireEvent.contextMenu(screen.getByText('Math'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename subject' }))
    const input = screen.getByLabelText('Subject name')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.closest('form')!)

    const row = await db.subject.get(subject.id)
    expect(row?.name).toBe('Math')
    expect(screen.getByLabelText('Subject name')).toBeInTheDocument()
  })

  it('pressing Escape discards the in-progress subject rename without writing', async () => {
    const { classRow, subject } = await seedClassWithOneSubjectOneStudent()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [],
      progress: [],
      lessons: await db.lesson.toArray(),
      activeSubjectId: subject.id,
    })

    fireEvent.contextMenu(screen.getByText('Math'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename subject' }))
    const input = screen.getByLabelText('Subject name')
    fireEvent.change(input, { target: { value: 'Algebra' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByLabelText('Subject name')).not.toBeInTheDocument()
    expect(screen.getByText('Math')).toBeInTheDocument()
    const row = await db.subject.get(subject.id)
    expect(row?.name).toBe('Math')
  })

  it('right-clicking a student row opens the menu with "Rename student" alongside "Remove student"', async () => {
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

    fireEvent.contextMenu(screen.getByText('Emily', { selector: '.class-board__student-name' }))

    expect(screen.getByRole('menuitem', { name: 'Rename student' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Remove student' })).toBeInTheDocument()
  })

  it('selecting "Rename student" reveals an inline input, and submitting a new name calls renameStudent', async () => {
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

    fireEvent.contextMenu(screen.getByText('Emily', { selector: '.class-board__student-name' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename student' }))
    const input = screen.getByLabelText('Student name')
    expect(input).toHaveValue('Emily')

    fireEvent.change(input, { target: { value: 'Emma' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(async () => {
      const row = await db.student.get(student.id)
      expect(row?.name).toBe('Emma')
    })
  })

  it('submitting a blank student name is rejected', async () => {
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

    fireEvent.contextMenu(screen.getByText('Emily', { selector: '.class-board__student-name' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename student' }))
    const input = screen.getByLabelText('Student name')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.closest('form')!)

    const row = await db.student.get(student.id)
    expect(row?.name).toBe('Emily')
    expect(screen.getByLabelText('Student name')).toBeInTheDocument()
  })

  it('pressing Escape discards the in-progress student rename without writing', async () => {
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

    fireEvent.contextMenu(screen.getByText('Emily', { selector: '.class-board__student-name' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename student' }))
    const input = screen.getByLabelText('Student name')
    fireEvent.change(input, { target: { value: 'Emma' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByLabelText('Student name')).not.toBeInTheDocument()
    expect(screen.getByText('Emily', { selector: '.class-board__student-name' })).toBeInTheDocument()
    const row = await db.student.get(student.id)
    expect(row?.name).toBe('Emily')
  })

  it('clicking a student row calls onStudentNavigate with that student\'s id', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const student = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })
    const onStudentNavigate = vi.fn()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [],
      lessons: [],
      activeSubjectId: subject.id,
      onStudentNavigate,
    })

    fireEvent.click(screen.getByText('Emily', { selector: '.class-board__student-name' }))

    expect(onStudentNavigate).toHaveBeenCalledWith(student.id)
  })

  it('right-clicking a student row still opens its context menu instead of calling onStudentNavigate', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const student = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })
    const onStudentNavigate = vi.fn()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [],
      lessons: [],
      activeSubjectId: subject.id,
      onStudentNavigate,
    })

    fireEvent.contextMenu(screen.getByText('Emily', { selector: '.class-board__student-name' }))

    expect(screen.getByRole('menuitem', { name: 'Rename student' })).toBeInTheDocument()
    expect(onStudentNavigate).not.toHaveBeenCalled()
  })

  it('selecting "Remove student" from the row menu does not also call onStudentNavigate', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const student = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })
    const onStudentNavigate = vi.fn()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [],
      lessons: [],
      activeSubjectId: subject.id,
      onStudentNavigate,
    })

    fireEvent.contextMenu(screen.getByText('Emily', { selector: '.class-board__student-name' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove student' }))

    expect(onStudentNavigate).not.toHaveBeenCalled()
  })

  it('clicking the student name while the row is in inline-rename mode does not call onStudentNavigate', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const student = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })
    const onStudentNavigate = vi.fn()

    renderBoard({
      classRow,
      subjects: [subject],
      students: [student],
      progress: [],
      lessons: [],
      activeSubjectId: subject.id,
      onStudentNavigate,
    })

    fireEvent.contextMenu(screen.getByText('Emily', { selector: '.class-board__student-name' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename student' }))
    const input = screen.getByLabelText('Student name')

    fireEvent.click(input)

    expect(onStudentNavigate).not.toHaveBeenCalled()
  })
})
