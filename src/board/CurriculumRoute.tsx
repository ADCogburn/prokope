import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getClass, listLessonsForSubject, listSubjectsForClass } from '../db'
import type { ClassRow } from '../db/schema'
import { Curriculum } from './Curriculum'

type ClassLookupStatus = 'loading' | 'found' | 'not-found'

/**
 * `/class/:classId/subject/:subjectId/curriculum`, per #56/#60. Mirrors
 * ClassBoardRoute's class lookup/not-found handling; a subjectId that
 * doesn't match any of the class's subjects redirects to the board rather
 * than picking a fallback subject -- there's no sensible default curriculum
 * to show instead.
 */
export function CurriculumRoute() {
  const { classId = '', subjectId = '' } = useParams<{ classId: string; subjectId: string }>()
  const navigate = useNavigate()

  const [classStatus, setClassStatus] = useState<ClassLookupStatus>('loading')
  const [classRow, setClassRow] = useState<ClassRow>()

  useEffect(() => {
    let cancelled = false
    setClassStatus('loading')
    getClass(classId).then((row) => {
      if (cancelled) return
      if (row) {
        setClassRow(row)
        setClassStatus('found')
      } else {
        setClassStatus('not-found')
      }
    })
    return () => {
      cancelled = true
    }
  }, [classId])

  const subjects = useLiveQuery(() => listSubjectsForClass(classId), [classId])
  const lessons = useLiveQuery(() => listLessonsForSubject(subjectId), [subjectId])

  if (classStatus === 'loading') {
    return (
      <div role="status">
        <p>Loading…</p>
      </div>
    )
  }

  if (classStatus === 'not-found') {
    return <Navigate to="/" replace />
  }

  if (subjects === undefined || lessons === undefined) {
    return (
      <div role="status">
        <p>Loading…</p>
      </div>
    )
  }

  const subject = subjects.find((s) => s.id === subjectId)
  if (!subject) {
    return <Navigate to={`/class/${classId}`} replace />
  }

  return (
    <Curriculum
      classRow={classRow!}
      subject={subject}
      lessons={lessons}
      onBack={() => navigate(`/class/${classId}/subject/${subjectId}`)}
    />
  )
}
