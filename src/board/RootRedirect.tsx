import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getClassForUser, listSubjectsForClass } from '../db'
import type { ClassRow } from '../db/schema'
import { ClassSetup } from './ClassSetup'

type Status = 'loading' | 'no-class' | 'has-class'

/**
 * `/`: auto-redirects straight to the teacher's one class -- and its first
 * subject, if it has one -- per #12's resolution ("`/` resolves the
 * teacher's one class and redirects straight to
 * `/class/:onlyClassId/subject/...`"). No class-picker UI yet. Shows the
 * one-time setup screen instead when the teacher has no class yet.
 */
export function RootRedirect() {
  const { user } = useAuth()
  const [status, setStatus] = useState<Status>('loading')
  const [target, setTarget] = useState<string>()

  useEffect(() => {
    if (!user) {
      return
    }

    let cancelled = false
    getClassForUser(user.userId).then(async (classRow) => {
      if (cancelled || !classRow) {
        if (!cancelled) setStatus('no-class')
        return
      }
      const subjects = await listSubjectsForClass(classRow.id)
      if (cancelled) return
      setTarget(subjects.length > 0 ? `/class/${classRow.id}/subject/${subjects[0].id}` : `/class/${classRow.id}`)
      setStatus('has-class')
    })

    return () => {
      cancelled = true
    }
  }, [user])

  function handleCreated(classRow: ClassRow) {
    // A freshly created class has no subjects yet -- #35 owns that UI.
    setTarget(`/class/${classRow.id}`)
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
    return <Navigate to={target!} replace />
  }

  return <ClassSetup userId={user.userId} onCreated={handleCreated} />
}
