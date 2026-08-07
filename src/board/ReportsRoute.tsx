import { useMemo } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  listLessonsForSubjects,
  listProgressForStudents,
  listReviewFlagsForStudents,
  listStudentsForClass,
  listSubjectsForClass,
} from '../db'
import { Reports } from './Reports'
import { useClassLookup } from './useClassLookup'

/**
 * `/class/:classId/report`, per #23. Mirrors ClassBoardRoute's data-loading
 * shape (same four collections, same loading/not-found handling) since
 * both report types need the whole class's subjects/students/lessons/
 * progress up front, not just one subject's.
 */
export function ReportsRoute() {
  const { classId = '' } = useParams<{ classId: string }>()
  const navigate = useNavigate()

  const { status: classStatus, classRow } = useClassLookup(classId)

  const subjects = useLiveQuery(() => listSubjectsForClass(classId), [classId])
  const students = useLiveQuery(() => listStudentsForClass(classId), [classId])

  const studentIds = useMemo(() => (students ?? []).map((s) => s.id), [students])
  const subjectIds = useMemo(() => (subjects ?? []).map((s) => s.id), [subjects])

  const progress = useLiveQuery(() => listProgressForStudents(studentIds), [studentIds])
  const reviewFlags = useLiveQuery(() => listReviewFlagsForStudents(studentIds), [studentIds])
  const lessons = useLiveQuery(() => listLessonsForSubjects(subjectIds), [subjectIds])

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

  if (
    subjects === undefined ||
    students === undefined ||
    progress === undefined ||
    reviewFlags === undefined ||
    lessons === undefined
  ) {
    return (
      <div role="status">
        <p>Loading…</p>
      </div>
    )
  }

  return (
    <Reports
      classRow={classRow!}
      subjects={subjects}
      students={students}
      lessons={lessons}
      progress={progress}
      reviewFlags={reviewFlags}
      onBack={() => navigate(`/class/${classId}`)}
    />
  )
}
