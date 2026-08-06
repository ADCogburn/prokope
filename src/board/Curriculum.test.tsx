import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Curriculum } from './Curriculum'
import { db } from '../db/schema'
import { createClass, createLesson, createSubject } from '../db'
import type { ClassRow, LessonRow, SubjectRow } from '../db/schema'

let mockWrapWidth = 2000
const resizeCallbacks: ResizeObserverCallback[] = []

class MockResizeObserver {
  callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    resizeCallbacks.push(callback)
  }
  observe() {
    this.callback([{ contentRect: { width: mockWrapWidth } } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }
  unobserve() {}
  disconnect() {}
}

function triggerResize(width: number) {
  act(() => {
    resizeCallbacks.forEach((callback) =>
      callback([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver),
    )
  })
}

beforeEach(() => {
  mockWrapWidth = 2000
  resizeCallbacks.length = 0
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(db.tables.map((table) => table.clear()))
})

function renderCurriculum(props: {
  classRow: ClassRow
  subject: SubjectRow
  lessons: LessonRow[]
  onBack?: () => void
}) {
  return render(
    <Curriculum
      classRow={props.classRow}
      subject={props.subject}
      lessons={props.lessons}
      onBack={props.onBack ?? vi.fn()}
    />,
  )
}

describe('Curriculum', () => {
  it('shows only the add-lesson card when the subject has zero lessons', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderCurriculum({ classRow, subject, lessons: [] })

    expect(screen.getByRole('button', { name: '+ Add lesson' })).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('lists lessons in unit/lesson_in_unit order', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lessonB = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 2,
      title: 'Fractions II',
      description: '',
    })
    const lessonA = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions I',
      description: '',
    })

    renderCurriculum({ classRow, subject, lessons: [lessonA, lessonB] })

    const items = screen.getAllByRole('listitem').map((el) => el.textContent)
    expect(items[0]).toContain('Fractions I')
    expect(items[1]).toContain('Fractions II')
  })

  it('creates a lesson from the add-lesson form and persists it', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderCurriculum({ classRow, subject, lessons: [] })

    fireEvent.click(screen.getByRole('button', { name: '+ Add lesson' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Fractions' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Lesson in unit'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(async () => {
      const rows = await db.lesson.where('subject_id').equals(subject.id).toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ title: 'Fractions', unit: 1, lesson_in_unit: 1, description: '' })
    })
  })

  it('shows an inline validation error and does not call createLesson when the (unit, lesson_in_unit) pair already exists', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const existing = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })

    renderCurriculum({ classRow, subject, lessons: [existing] })

    fireEvent.click(screen.getByRole('button', { name: '+ Add lesson' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Decimals' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Lesson in unit'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Unit 1, Lesson 1 already exists.')).toBeInTheDocument()
    const rows = await db.lesson.where('subject_id').equals(subject.id).toArray()
    expect(rows).toHaveLength(1)
  })

  it('auto-fills lesson-in-unit with one more than the highest existing lesson in the typed unit', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const l1 = await createLesson({ subject_id: subject.id, unit: 2, lesson_in_unit: 1, title: 'A', description: '' })
    const l2 = await createLesson({ subject_id: subject.id, unit: 2, lesson_in_unit: 2, title: 'B', description: '' })
    const l3 = await createLesson({ subject_id: subject.id, unit: 2, lesson_in_unit: 3, title: 'C', description: '' })

    renderCurriculum({ classRow, subject, lessons: [l1, l2, l3] })

    fireEvent.click(screen.getByRole('button', { name: '+ Add lesson' }))
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '2' } })

    expect(screen.getByLabelText('Lesson in unit')).toHaveValue(4)
  })

  it('re-suggests lesson-in-unit 1 when the typed unit has no existing lessons', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const l1 = await createLesson({ subject_id: subject.id, unit: 2, lesson_in_unit: 1, title: 'A', description: '' })

    renderCurriculum({ classRow, subject, lessons: [l1] })

    fireEvent.click(screen.getByRole('button', { name: '+ Add lesson' }))
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '2' } })
    expect(screen.getByLabelText('Lesson in unit')).toHaveValue(2)

    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '3' } })
    expect(screen.getByLabelText('Lesson in unit')).toHaveValue(1)
  })

  it('pre-fills Unit and Lesson to the last-used unit and next available lesson number when opened on a subject with existing lessons', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const l1 = await createLesson({ subject_id: subject.id, unit: 1, lesson_in_unit: 1, title: 'A', description: '' })
    const l2 = await createLesson({ subject_id: subject.id, unit: 2, lesson_in_unit: 1, title: 'B', description: '' })
    const l3 = await createLesson({ subject_id: subject.id, unit: 2, lesson_in_unit: 2, title: 'C', description: '' })

    renderCurriculum({ classRow, subject, lessons: [l1, l2, l3] })

    fireEvent.click(screen.getByRole('button', { name: '+ Add lesson' }))

    expect(screen.getByLabelText('Unit')).toHaveValue(2)
    expect(screen.getByLabelText('Lesson in unit')).toHaveValue(3)
  })

  it('pre-fills Unit 1, Lesson 1 when opened on a subject with zero lessons', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderCurriculum({ classRow, subject, lessons: [] })

    fireEvent.click(screen.getByRole('button', { name: '+ Add lesson' }))

    expect(screen.getByLabelText('Unit')).toHaveValue(1)
    expect(screen.getByLabelText('Lesson in unit')).toHaveValue(1)
  })

  it('still live-recomputes the suggested lesson number when the teacher types a different unit after the pre-filled form opens', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const l1 = await createLesson({ subject_id: subject.id, unit: 1, lesson_in_unit: 1, title: 'A', description: '' })

    renderCurriculum({ classRow, subject, lessons: [l1] })

    fireEvent.click(screen.getByRole('button', { name: '+ Add lesson' }))
    expect(screen.getByLabelText('Unit')).toHaveValue(1)
    expect(screen.getByLabelText('Lesson in unit')).toHaveValue(2)

    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    expect(screen.getByLabelText('Lesson in unit')).toHaveValue(1)
  })

  it('lets the teacher overwrite the pre-filled unit/lesson values and submit successfully', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const l1 = await createLesson({ subject_id: subject.id, unit: 1, lesson_in_unit: 1, title: 'A', description: '' })

    renderCurriculum({ classRow, subject, lessons: [l1] })

    fireEvent.click(screen.getByRole('button', { name: '+ Add lesson' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Decimals' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '9' } })
    fireEvent.change(screen.getByLabelText('Lesson in unit'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(async () => {
      const rows = await db.lesson.where('subject_id').equals(subject.id).toArray()
      const created = rows.find((row) => row.title === 'Decimals')
      expect(created).toMatchObject({ unit: 9, lesson_in_unit: 4 })
    })
  })

  it('deletes a lesson after confirmation', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderCurriculum({ classRow, subject, lessons: [lesson] })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Fractions' }))

    await waitFor(async () => {
      const row = await db.lesson.get(lesson.id)
      expect(row?.deleted_at).not.toBeNull()
    })
  })

  it('does not delete a lesson when the confirmation is declined', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderCurriculum({ classRow, subject, lessons: [lesson] })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Fractions' }))

    const row = await db.lesson.get(lesson.id)
    expect(row?.deleted_at).toBeNull()
  })

  it('cancelling the add-lesson form collapses it back to the "+" card without creating a lesson', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderCurriculum({ classRow, subject, lessons: [] })

    fireEvent.click(screen.getByRole('button', { name: '+ Add lesson' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Fractions' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: '+ Add lesson' })).toBeInTheDocument()
    const rows = await db.lesson.where('subject_id').equals(subject.id).toArray()
    expect(rows).toHaveLength(0)
  })

  it('right-clicking the subject name header opens the menu with "Rename subject"', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderCurriculum({ classRow, subject, lessons: [] })

    fireEvent.contextMenu(screen.getByText('Math'))

    expect(screen.getByRole('menuitem', { name: 'Rename subject' })).toBeInTheDocument()
  })

  it('renaming the subject from the curriculum header calls renameSubject and persists it', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderCurriculum({ classRow, subject, lessons: [] })

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

  it('submitting a blank subject name from the curriculum header is rejected', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderCurriculum({ classRow, subject, lessons: [] })

    fireEvent.contextMenu(screen.getByText('Math'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename subject' }))
    const input = screen.getByLabelText('Subject name')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.closest('form')!)

    const row = await db.subject.get(subject.id)
    expect(row?.name).toBe('Math')
    expect(screen.getByLabelText('Subject name')).toBeInTheDocument()
  })

  it('pressing Escape discards the in-progress subject rename on the curriculum header without writing', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderCurriculum({ classRow, subject, lessons: [] })

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

  it('shows a pencil-icon rename control next to the subject name in the curriculum header', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderCurriculum({ classRow, subject, lessons: [] })

    expect(screen.getByRole('button', { name: 'Rename subject' })).toBeInTheDocument()
  })

  it('clicking the pencil icon turns the subject name into an editable field pre-filled with the current name', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderCurriculum({ classRow, subject, lessons: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Rename subject' }))

    expect(screen.getByLabelText('Subject name')).toHaveValue('Math')
  })

  it('saving a valid new name from the pencil control calls renameSubject and persists it', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderCurriculum({ classRow, subject, lessons: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Rename subject' }))
    const input = screen.getByLabelText('Subject name')
    fireEvent.change(input, { target: { value: 'Algebra' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(async () => {
      const row = await db.subject.get(subject.id)
      expect(row?.name).toBe('Algebra')
    })
  })

  it('saving an empty or whitespace-only name from the pencil control shows an inline validation error and does not call renameSubject', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderCurriculum({ classRow, subject, lessons: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Rename subject' }))
    const input = screen.getByLabelText('Subject name')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.closest('form')!)

    expect(screen.getByText('Name cannot be empty.')).toBeInTheDocument()
    const row = await db.subject.get(subject.id)
    expect(row?.name).toBe('Math')
  })

  it('pressing Escape after opening the pencil control discards the edit and restores the original name without calling renameSubject', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderCurriculum({ classRow, subject, lessons: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Rename subject' }))
    const input = screen.getByLabelText('Subject name')
    fireEvent.change(input, { target: { value: 'Algebra' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByLabelText('Subject name')).not.toBeInTheDocument()
    expect(screen.getByText('Math')).toBeInTheDocument()
    const row = await db.subject.get(subject.id)
    expect(row?.name).toBe('Math')
  })

  it('right-clicking a lesson row opens the menu with "Edit lesson"', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: 'Intro to fractions',
    })

    renderCurriculum({ classRow, subject, lessons: [lesson] })

    fireEvent.contextMenu(screen.getByText('Fractions', { selector: '.curriculum__lesson-title' }))

    expect(screen.getByRole('menuitem', { name: 'Edit lesson' })).toBeInTheDocument()
  })

  it('selecting "Edit lesson" reveals an inline title/description form pre-filled with the current values', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: 'Intro to fractions',
    })

    renderCurriculum({ classRow, subject, lessons: [lesson] })

    fireEvent.contextMenu(screen.getByText('Fractions', { selector: '.curriculum__lesson-title' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit lesson' }))

    expect(screen.getByLabelText('Title')).toHaveValue('Fractions')
    expect(screen.getByLabelText('Description')).toHaveValue('Intro to fractions')
  })

  it('submitting the edit-lesson form calls updateLessonContent and persists the new title/description', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: 'Intro to fractions',
    })

    renderCurriculum({ classRow, subject, lessons: [lesson] })

    fireEvent.contextMenu(screen.getByText('Fractions', { selector: '.curriculum__lesson-title' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit lesson' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Fractions II' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Advanced fractions' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(async () => {
      const row = await db.lesson.get(lesson.id)
      expect(row?.title).toBe('Fractions II')
      expect(row?.description).toBe('Advanced fractions')
    })
    // unit/lesson_in_unit weren't touched by this test, so they stay as-is.
    const row = await db.lesson.get(lesson.id)
    expect(row?.unit).toBe(1)
    expect(row?.lesson_in_unit).toBe(1)
  })

  it('submitting a blank title in the edit-lesson form is rejected', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: 'Intro to fractions',
    })

    renderCurriculum({ classRow, subject, lessons: [lesson] })

    fireEvent.contextMenu(screen.getByText('Fractions', { selector: '.curriculum__lesson-title' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit lesson' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '   ' } })

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    const row = await db.lesson.get(lesson.id)
    expect(row?.title).toBe('Fractions')
  })

  it('clicking Cancel in the edit-lesson form discards changes without writing', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: 'Intro to fractions',
    })

    renderCurriculum({ classRow, subject, lessons: [lesson] })

    fireEvent.contextMenu(screen.getByText('Fractions', { selector: '.curriculum__lesson-title' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit lesson' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Changed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
    expect(screen.getByText('Fractions', { selector: '.curriculum__lesson-title' })).toBeInTheDocument()
    const row = await db.lesson.get(lesson.id)
    expect(row?.title).toBe('Fractions')
  })

  it('pressing Escape in the edit-lesson form discards changes without writing', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: 'Intro to fractions',
    })

    renderCurriculum({ classRow, subject, lessons: [lesson] })

    fireEvent.contextMenu(screen.getByText('Fractions', { selector: '.curriculum__lesson-title' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit lesson' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Changed' } })
    fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Escape' })

    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
    const row = await db.lesson.get(lesson.id)
    expect(row?.title).toBe('Fractions')
  })

  it('shows a visible Edit control next to Delete on each lesson row', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: 'Intro to fractions',
    })

    renderCurriculum({ classRow, subject, lessons: [lesson] })

    expect(screen.getByRole('button', { name: 'Edit Fractions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Fractions' })).toBeInTheDocument()
  })

  it('clicking Edit pre-fills the form with the lesson\'s current unit, lesson number, title, and description', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 2,
      lesson_in_unit: 3,
      title: 'Fractions',
      description: 'Intro to fractions',
    })

    renderCurriculum({ classRow, subject, lessons: [lesson] })

    fireEvent.click(screen.getByRole('button', { name: 'Edit Fractions' }))

    expect(screen.getByLabelText('Unit')).toHaveValue(2)
    expect(screen.getByLabelText('Lesson in unit')).toHaveValue(3)
    expect(screen.getByLabelText('Title')).toHaveValue('Fractions')
    expect(screen.getByLabelText('Description')).toHaveValue('Intro to fractions')
  })

  it('saving a valid unit/lesson-number/title/description change updates all four fields in one write', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: 'Intro to fractions',
    })

    renderCurriculum({ classRow, subject, lessons: [lesson] })

    fireEvent.click(screen.getByRole('button', { name: 'Edit Fractions' }))
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Lesson in unit'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Fractions II' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Advanced fractions' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(async () => {
      const row = await db.lesson.get(lesson.id)
      expect(row).toMatchObject({
        unit: 3,
        lesson_in_unit: 2,
        title: 'Fractions II',
        description: 'Advanced fractions',
      })
    })
  })

  it('rejects saving a unit/lesson-number combination that collides with another existing lesson in the subject', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lessonA = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })
    const lessonB = await createLesson({
      subject_id: subject.id,
      unit: 2,
      lesson_in_unit: 1,
      title: 'Decimals',
      description: '',
    })

    renderCurriculum({ classRow, subject, lessons: [lessonA, lessonB] })

    fireEvent.click(screen.getByRole('button', { name: 'Edit Decimals' }))
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Lesson in unit'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Unit 1, Lesson 1 already exists.')).toBeInTheDocument()
    const row = await db.lesson.get(lessonB.id)
    expect(row).toMatchObject({ unit: 2, lesson_in_unit: 1 })
  })

  it('allows saving the lesson\'s own unchanged unit/lesson-number position', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })

    renderCurriculum({ classRow, subject, lessons: [lesson] })

    fireEvent.click(screen.getByRole('button', { name: 'Edit Fractions' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Fractions (revised)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(async () => {
      const row = await db.lesson.get(lesson.id)
      expect(row).toMatchObject({ unit: 1, lesson_in_unit: 1, title: 'Fractions (revised)' })
    })
  })

  it('cancelling the Edit form discards changes and restores the original row without writing', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: 'Intro to fractions',
    })

    renderCurriculum({ classRow, subject, lessons: [lesson] })

    fireEvent.click(screen.getByRole('button', { name: 'Edit Fractions' }))
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '9' } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Changed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByLabelText('Unit')).not.toBeInTheDocument()
    expect(screen.getByText('Fractions', { selector: '.curriculum__lesson-title' })).toBeInTheDocument()
    const row = await db.lesson.get(lesson.id)
    expect(row).toMatchObject({ unit: 1, lesson_in_unit: 1, title: 'Fractions' })
  })

  it("keeps the lesson's id unchanged across an edit", async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })

    renderCurriculum({ classRow, subject, lessons: [lesson] })

    fireEvent.click(screen.getByRole('button', { name: 'Edit Fractions' }))
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(async () => {
      const row = await db.lesson.get(lesson.id)
      expect(row?.id).toBe(lesson.id)
      expect(row?.unit).toBe(5)
    })
  })

  it('renders lessons grouped into one column per unit, in unit order', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const l1 = await createLesson({ subject_id: subject.id, unit: 1, lesson_in_unit: 1, title: 'A', description: '' })
    const l2 = await createLesson({ subject_id: subject.id, unit: 1, lesson_in_unit: 2, title: 'B', description: '' })
    const l3 = await createLesson({ subject_id: subject.id, unit: 2, lesson_in_unit: 1, title: 'C', description: '' })

    renderCurriculum({ classRow, subject, lessons: [l1, l2, l3] })

    const headers = document.querySelectorAll('.curriculum__unit-header')
    expect([...headers].map((el) => el.textContent)).toEqual(['Unit 1', 'Unit 2'])

    const columns = document.querySelectorAll('.curriculum__unit-column')
    expect(columns[0].querySelectorAll('.curriculum__lesson-title')).toHaveLength(2)
    expect(columns[1].querySelectorAll('.curriculum__lesson-title')).toHaveLength(1)
    expect(columns[1].textContent).toContain('C')
  })

  it('shows only the lesson label on each row, without a "Unit N ·" prefix', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 3,
      lesson_in_unit: 2,
      title: 'Fractions',
      description: '',
    })

    renderCurriculum({ classRow, subject, lessons: [lesson] })

    const position = document.querySelector('.curriculum__lesson-position')
    expect(position?.textContent).toBe('Lesson 2')
    expect(position?.textContent).not.toContain('Unit')
  })

  it('shows only as many unit columns as fit the measured wrap width, with a right arrow to reveal the rest', async () => {
    mockWrapWidth = 300
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const l1 = await createLesson({ subject_id: subject.id, unit: 1, lesson_in_unit: 1, title: 'A', description: '' })
    const l2 = await createLesson({ subject_id: subject.id, unit: 2, lesson_in_unit: 1, title: 'B', description: '' })

    renderCurriculum({ classRow, subject, lessons: [l1, l2] })

    expect(document.querySelectorAll('.curriculum__unit-column')).toHaveLength(1)
    expect(screen.getByText('Unit 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next unit' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous unit' })).not.toBeInTheDocument()
  })

  it('clicking the right arrow reveals exactly one additional unit and hides exactly one from the left edge', async () => {
    mockWrapWidth = 600
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const l1 = await createLesson({ subject_id: subject.id, unit: 1, lesson_in_unit: 1, title: 'A', description: '' })
    const l2 = await createLesson({ subject_id: subject.id, unit: 2, lesson_in_unit: 1, title: 'B', description: '' })
    const l3 = await createLesson({ subject_id: subject.id, unit: 3, lesson_in_unit: 1, title: 'C', description: '' })
    const l4 = await createLesson({ subject_id: subject.id, unit: 4, lesson_in_unit: 1, title: 'D', description: '' })

    renderCurriculum({ classRow, subject, lessons: [l1, l2, l3, l4] })

    expect([...document.querySelectorAll('.curriculum__unit-header')].map((el) => el.textContent)).toEqual([
      'Unit 1',
      'Unit 2',
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Next unit' }))

    expect([...document.querySelectorAll('.curriculum__unit-header')].map((el) => el.textContent)).toEqual([
      'Unit 2',
      'Unit 3',
    ])
  })

  it('the left arrow does the mirror operation of the right arrow', async () => {
    mockWrapWidth = 600
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const l1 = await createLesson({ subject_id: subject.id, unit: 1, lesson_in_unit: 1, title: 'A', description: '' })
    const l2 = await createLesson({ subject_id: subject.id, unit: 2, lesson_in_unit: 1, title: 'B', description: '' })
    const l3 = await createLesson({ subject_id: subject.id, unit: 3, lesson_in_unit: 1, title: 'C', description: '' })
    const l4 = await createLesson({ subject_id: subject.id, unit: 4, lesson_in_unit: 1, title: 'D', description: '' })

    renderCurriculum({ classRow, subject, lessons: [l1, l2, l3, l4] })

    fireEvent.click(screen.getByRole('button', { name: 'Next unit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous unit' }))

    expect([...document.querySelectorAll('.curriculum__unit-header')].map((el) => el.textContent)).toEqual([
      'Unit 1',
      'Unit 2',
    ])
  })

  it('shows no left arrow at the first visible unit and no right arrow at the last visible unit', async () => {
    mockWrapWidth = 300
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const l1 = await createLesson({ subject_id: subject.id, unit: 1, lesson_in_unit: 1, title: 'A', description: '' })
    const l2 = await createLesson({ subject_id: subject.id, unit: 2, lesson_in_unit: 1, title: 'B', description: '' })

    renderCurriculum({ classRow, subject, lessons: [l1, l2] })

    expect(screen.queryByRole('button', { name: 'Previous unit' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next unit' }))

    expect(screen.queryByRole('button', { name: 'Next unit' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous unit' })).toBeInTheDocument()
  })

  it('shows neither arrow when every unit already fits without scrolling', async () => {
    mockWrapWidth = 2000
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const l1 = await createLesson({ subject_id: subject.id, unit: 1, lesson_in_unit: 1, title: 'A', description: '' })
    const l2 = await createLesson({ subject_id: subject.id, unit: 2, lesson_in_unit: 1, title: 'B', description: '' })

    renderCurriculum({ classRow, subject, lessons: [l1, l2] })

    expect(screen.queryByRole('button', { name: 'Previous unit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next unit' })).not.toBeInTheDocument()
    expect(document.querySelectorAll('.curriculum__unit-column')).toHaveLength(2)
  })

  it('recomputes the visible unit-column count when the wrap is resized', async () => {
    mockWrapWidth = 300
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const l1 = await createLesson({ subject_id: subject.id, unit: 1, lesson_in_unit: 1, title: 'A', description: '' })
    const l2 = await createLesson({ subject_id: subject.id, unit: 2, lesson_in_unit: 1, title: 'B', description: '' })

    renderCurriculum({ classRow, subject, lessons: [l1, l2] })

    expect(document.querySelectorAll('.curriculum__unit-column')).toHaveLength(1)

    triggerResize(2000)

    expect(document.querySelectorAll('.curriculum__unit-column')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Next unit' })).not.toBeInTheDocument()
  })
})
