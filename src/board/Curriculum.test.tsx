import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Curriculum } from './Curriculum'
import { db } from '../db/schema'
import { createClass, createLesson, createSubject } from '../db'
import type { ClassRow, LessonRow, SubjectRow } from '../db/schema'

afterEach(async () => {
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
})
