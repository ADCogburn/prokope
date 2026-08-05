import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { RootRedirect } from './RootRedirect'
import { AuthProvider } from '../auth/AuthContext'
import { AUTH_TOKEN_STORAGE_KEY } from '../auth/token'
import { db } from '../db/schema'
import { createClass, createSubject } from '../db'

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

function BoardStub() {
  const { classId, subjectId } = useParams<{ classId: string; subjectId?: string }>()
  return <div>{subjectId ? `Board for ${classId} subject ${subjectId}` : `Board for ${classId}`}</div>
}

function renderAsAuthenticatedUser(userId = 'user-1') {
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ userId, email: 'teacher@example.com' }), { status: 200 }),
    ),
  )

  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/class/:classId" element={<BoardStub />} />
          <Route path="/class/:classId/subject/:subjectId" element={<BoardStub />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('RootRedirect', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the class setup screen when the teacher has no class yet', async () => {
    renderAsAuthenticatedUser()

    await waitFor(() => expect(screen.getByText('Set up your class')).toBeInTheDocument())
  })

  it("redirects to the teacher's class when one already exists but has no subjects yet", async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })

    renderAsAuthenticatedUser('user-1')

    await waitFor(() => expect(screen.getByText(`Board for ${classRow.id}`)).toBeInTheDocument())
  })

  it("redirects straight to the class's first subject, per #12, when one exists", async () => {
    const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
    const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })

    renderAsAuthenticatedUser('user-1')

    await waitFor(() =>
      expect(screen.getByText(`Board for ${classRow.id} subject ${subject.id}`)).toBeInTheDocument(),
    )
  })

  it("does not redirect to a different teacher's class", async () => {
    await createClass({ user_id: 'other-user', name: 'Not mine' })

    renderAsAuthenticatedUser('user-1')

    await waitFor(() => expect(screen.getByText('Set up your class')).toBeInTheDocument())
  })
})
