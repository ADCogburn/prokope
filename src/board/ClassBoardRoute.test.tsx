import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ClassBoardRoute } from './ClassBoardRoute'
import { db } from '../db/schema'
import { createClass, createStudent, createSubject } from '../db'

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

function renderRoute(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<div>Root stub</div>} />
        <Route path="/class/:classId" element={<ClassBoardRoute />} />
        <Route path="/class/:classId/subject/:subjectId" element={<ClassBoardRoute />} />
        <Route path="/class/:classId/subject/:subjectId/curriculum" element={<div>Curriculum stub</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ClassBoardRoute', () => {
  it('redirects to / when the classId does not match any class', async () => {
    renderRoute('/class/missing-class')

    await waitFor(() => expect(screen.getByText('Root stub')).toBeInTheDocument())
  })

  it('renders the empty-state board when the class has no subjects', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    renderRoute(`/class/${classRow.id}`)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '+ Add subject' })).toBeInTheDocument(),
    )
  })

  it('redirects to the first subject when the URL has no subjectId', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderRoute(`/class/${classRow.id}`)

    await waitFor(() => expect(screen.getByText('Math')).toBeInTheDocument())
  })

  it('redirects to the first subject when the URL names a subject that does not exist', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderRoute(`/class/${classRow.id}/subject/does-not-exist`)

    await waitFor(() => expect(screen.getByText('Math')).toBeInTheDocument())
    expect(subject.id).toBeTruthy()
  })

  it('renders the named subject when the URL already points at a real one', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    const subjectB = await createSubject({ class_id: classRow.id, name: 'Reading', position: 1 })
    await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })

    renderRoute(`/class/${classRow.id}/subject/${subjectB.id}`)

    await waitFor(() => expect(screen.getByText('Reading')).toBeInTheDocument())
  })

  it('navigates to that subject\'s curriculum route when a zero-lessons panel\'s "+" link is clicked', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderRoute(`/class/${classRow.id}/subject/${subject.id}`)

    await waitFor(() => expect(screen.getByRole('button', { name: '+ Add lessons' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '+ Add lessons' }))

    await waitFor(() => expect(screen.getByText('Curriculum stub')).toBeInTheDocument())
  })
})
