import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  listLessonsForSubjects,
  listProgressForStudents,
  listReviewFlagsForStudents,
  listSubjectsForClass,
} from '../db'
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
  const reviewFlags = useLiveQuery(() => listReviewFlagsForStudents([studentId]), [studentId])

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

  if (subjects === undefined || lessons === undefined || progress === undefined || reviewFlags === undefined) {
    return (
      <div role="status">
        <p>Loading…</p>
      </div>
    )
  }

  return (
    <StudentSummary
      // Force a fresh mount per student, so #154's page-visit-scoped undo
      // state (plain useState in StudentSummary) can't leak from one
      // student's visit into another's if a caller ever links directly
      // between two Student Summary pages without an intervening route.
      key={studentId}
      classRow={classRow!}
      student={student!}
      subjects={subjects}
      lessons={lessons}
      progress={progress}
      reviewFlags={reviewFlags}
      onBack={() => navigate(-1)}
    />
  )
}
