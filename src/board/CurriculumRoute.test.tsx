import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CurriculumRoute } from './CurriculumRoute'
import { db } from '../db/schema'
import { createClass, createLesson, createSubject } from '../db'

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

function renderRoute(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<div>Root stub</div>} />
        <Route path="/class/:classId" element={<div>Board stub</div>} />
        <Route path="/class/:classId/subject/:subjectId" element={<div>Subject board stub</div>} />
        <Route path="/class/:classId/subject/:subjectId/curriculum" element={<CurriculumRoute />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CurriculumRoute', () => {
  it('redirects to / when the classId does not match any class', async () => {
    renderRoute('/class/missing-class/subject/missing-subject/curriculum')

    await waitFor(() => expect(screen.getByText('Root stub')).toBeInTheDocument())
  })

  it('redirects to the board when the subjectId does not match any subject in the class', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    renderRoute(`/class/${classRow.id}/subject/does-not-exist/curriculum`)

    await waitFor(() => expect(screen.getByText('Board stub')).toBeInTheDocument())
  })

  it('renders the empty-lessons state when the subject has zero lessons', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderRoute(`/class/${classRow.id}/subject/${subject.id}/curriculum`)

    await waitFor(() => expect(screen.getByRole('button', { name: '+ Add lesson' })).toBeInTheDocument())
    expect(screen.getByText('Math')).toBeInTheDocument()
  })

  it("renders the named subject's lessons in unit/lesson-in-unit order", async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    await createLesson({
      subject_id: subject.id,
      unit: 2,
      lesson_in_unit: 1,
      title: 'Decimals',
      description: '',
    })
    await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })

    renderRoute(`/class/${classRow.id}/subject/${subject.id}/curriculum`)

    await waitFor(() => expect(screen.getByText('Fractions')).toBeInTheDocument())
    const titles = screen.getAllByText(/Fractions|Decimals/).map((el) => el.textContent)
    expect(titles).toEqual(['Fractions', 'Decimals'])
  })

  it('navigates back to the subject board when "Back to board" is clicked', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderRoute(`/class/${classRow.id}/subject/${subject.id}/curriculum`)

    await waitFor(() => expect(screen.getByRole('button', { name: '← Back to board' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '← Back to board' }))

    await waitFor(() => expect(screen.getByText('Subject board stub')).toBeInTheDocument())
  })
})
