import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StudentSummaryRoute } from './StudentSummaryRoute'
import { db } from '../db/schema'
import { createClass, createLesson, createStudent, createSubject, upsertProgressStep, upsertReviewFlag } from '../db'

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

function renderRoute(initialEntries: string[], initialIndex = 0) {
  return render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
      <Routes>
        <Route path="/" element={<div>Root stub</div>} />
        <Route path="/class/:classId" element={<div>Board stub</div>} />
        <Route path="/class/:classId/student/:studentId" element={<StudentSummaryRoute />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('StudentSummaryRoute', () => {
  it('shows a loading state before the class and student data resolve', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const student = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })

    renderRoute([`/class/${classRow.id}/student/${student.id}`])

    expect(screen.getByRole('status')).toBeInTheDocument()

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('redirects to / when the classId does not match any class', async () => {
    renderRoute(['/class/missing-class/student/missing-student'])

    await waitFor(() => expect(screen.getByText('Root stub')).toBeInTheDocument())
  })

  it('redirects to the board when the studentId does not match any student in the class', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    renderRoute([`/class/${classRow.id}/student/does-not-exist`])

    await waitFor(() => expect(screen.getByText('Board stub')).toBeInTheDocument())
  })

  it('redirects to the board when the student belongs to a different class', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const otherClass = await createClass({ user_id: 'user-2', name: 'Other Room' })
    const otherStudent = await createStudent({ class_id: otherClass.id, name: 'Sam', position: 0 })

    renderRoute([`/class/${classRow.id}/student/${otherStudent.id}`])

    await waitFor(() => expect(screen.getByText('Board stub')).toBeInTheDocument())
  })

  it("renders the student's name, avatar, and one row per subject in the class's configured order", async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const student = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })
    const math = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const reading = await createSubject({ class_id: classRow.id, name: 'Reading', position: 1 })
    await createSubject({ class_id: classRow.id, name: 'Art', position: 2 })
    const mathLesson = await createLesson({
      subject_id: math.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })
    await createLesson({
      subject_id: reading.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Phonics',
      description: '',
    })
    await upsertProgressStep(student.id, math.id, { unit: mathLesson.unit, lesson_in_unit: mathLesson.lesson_in_unit })

    const { container } = renderRoute([`/class/${classRow.id}/student/${student.id}`])

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Emily' })).toBeInTheDocument())
    expect(screen.getByText('E', { selector: '.student-summary__avatar' })).toBeInTheDocument()

    await waitFor(() => {
      const statuses = [...container.querySelectorAll('.student-summary__subject-status')]
      expect(statuses.map((el) => el.textContent)).toEqual(['1.1 - Fractions', 'Not started', 'No lessons yet'])
    })
    const names = [...container.querySelectorAll('.student-summary__subject-name')]
    expect(names.map((el) => el.textContent)).toEqual(['Math', 'Reading', 'Art'])
  })

  it('visually distinguishes a subject the student is flagged for review in', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const student = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })
    const math = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: math.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })
    await upsertProgressStep(student.id, math.id, { unit: lesson.unit, lesson_in_unit: lesson.lesson_in_unit })
    // #152/ADR-0011: review lives on ReviewFlag, keyed by (student, lesson),
    // rather than on the progress row.
    await upsertReviewFlag(student.id, lesson.id, true)

    renderRoute([`/class/${classRow.id}/student/${student.id}`])

    await waitFor(() => {
      expect(screen.getByText('Math').closest('li')).toHaveClass('student-summary__subject-row--review')
    })
  })

  it('the back control navigates to the previous page in browser history, not a fixed route', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const student = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })

    renderRoute(['/', `/class/${classRow.id}/student/${student.id}`], 1)

    await waitFor(() => expect(screen.getByRole('button', { name: '← Back' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '← Back' }))

    await waitFor(() => expect(screen.getByText('Root stub')).toBeInTheDocument())
  })
})
