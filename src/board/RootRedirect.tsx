import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getClassForUser } from '../db'
import type { ClassRow } from '../db/schema'
import { ClassSetup } from './ClassSetup'

type Status = 'loading' | 'no-class' | 'has-class'

/**
 * `/`: auto-redirects to the teacher's one class, per #12 -- no class-picker
 * UI yet, single class per teacher for MVP. Shows the one-time setup screen
 * instead when the teacher has no class yet.
 */
export function RootRedirect() {
  const { user } = useAuth()
  const [status, setStatus] = useState<Status>('loading')
  const [classId, setClassId] = useState<string>()

  useEffect(() => {
    if (!user) {
      return
    }

    let cancelled = false
    getClassForUser(user.userId).then((classRow) => {
      if (cancelled) return
      if (classRow) {
        setClassId(classRow.id)
        setStatus('has-class')
      } else {
        setStatus('no-class')
      }
    })

    return () => {
      cancelled = true
    }
  }, [user])

  function handleCreated(classRow: ClassRow) {
    setClassId(classRow.id)
    setStatus('has-class')
  }

  if (!user || status === 'loading') {
    return (
      <div role="status">
        <p>Loading…</p>
      </div>
    )
  }

  if (status === 'has-class') {
    return <Navigate to={`/class/${classId}`} replace />
  }

  return <ClassSetup userId={user.userId} onCreated={handleCreated} />
}
