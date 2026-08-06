import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ReportsRoute } from './ReportsRoute'
import { db } from '../db/schema'
import { createClass, createLesson, createStudent, createSubject } from '../db'

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

function renderRoute(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<div>Root stub</div>} />
        <Route path="/class/:classId" element={<div>Board stub</div>} />
        <Route path="/class/:classId/report" element={<ReportsRoute />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ReportsRoute', () => {
  it('redirects to / when the classId does not match any class', async () => {
    renderRoute('/class/missing-class/report')

    await waitFor(() => expect(screen.getByText('Root stub')).toBeInTheDocument())
  })

  it('loads the class, subjects, students, and lessons and renders the Reports screen', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
    await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Fractions',
      description: '',
    })
    await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })

    renderRoute(`/class/${classRow.id}/report`)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Emily' })).toBeInTheDocument()
  })

  it('navigates back to the class board route when the back button is clicked', async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    renderRoute(`/class/${classRow.id}/report`)

    await waitFor(() => expect(screen.getByRole('button', { name: /Back to board/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Back to board/ }))

    await waitFor(() => expect(screen.getByText('Board stub')).toBeInTheDocument())
  })
})
