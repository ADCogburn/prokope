import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listLessonsForSubjects, listProgressForStudents, listSubjectsForClass } from '../db'
import { StudentSummary } from './StudentSummary'
import { useClassLookup } from './useClassLookup'
import { useStudentLookup } from './useStudentLookup'

/**
 * `/class/:classId/student/:studentId`, per #107. Mirrors ClassBoardRoute/
 * CurriculumRoute's class lookup/not-found handling; a studentId that
 * doesn't match any (live) student in the class redirects to the board,
 * same as CurriculumRoute does for an unmatched subjectId, rather than
 * picking a fallback student. "Back" is real browser-back (navigate(-1)),
 * not a fixed destination, since this page can be reached from more than
 * one place.
 */
export function StudentSummaryRoute() {
  const { classId = '', studentId = '' } = useParams<{ classId: string; studentId: string }>()
  const navigate = useNavigate()

  const { status: classStatus, classRow } = useClassLookup(classId)
  const { status: studentStatus, student } = useStudentLookup(studentId, classId)

  const subjects = useLiveQuery(() => listSubjectsForClass(classId), [classId])
  const subjectIds = subjects?.map((subject) => subject.id) ?? []
  const lessons = useLiveQuery(() => listLessonsForSubjects(subjectIds), [subjectIds.join(',')])
  const progress = useLiveQuery(() => listProgressForStudents([studentId]), [studentId])

  if (classStatus === 'loading' || studentStatus === 'loading') {
    return (
      <div role="status">
        <p>Loading…</p>
      </div>
    )
  }

  if (classStatus === 'not-found') {
    return <Navigate to="/" replace />
  }

  if (studentStatus === 'not-found') {
    return <Navigate to={`/class/${classId}`} replace />
  }

  if (subjects === undefined || lessons === undefined || progress === undefined) {
    return (
      <div role="status">
        <p>Loading…</p>
      </div>
    )
  }

  return (
    <StudentSummary
      classRow={classRow!}
      student={student!}
      subjects={subjects}
      lessons={lessons}
      progress={progress}
      onBack={() => navigate(-1)}
    />
  )
}
