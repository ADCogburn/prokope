import { useMemo } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listLessonsForSubjects, listProgressForStudents, listStudentsForClass, listSubjectsForClass } from '../db'
import { ClassBoard } from './ClassBoard'
import { useClassLookup } from './useClassLookup'

/**
 * `/class/:classId` and `/class/:classId/subject/:subjectId`, per #12/#22.
 * The subject segment is optional and canonicalized: with no subjects it's
 * dropped (empty-state board), otherwise it's redirected to the first
 * subject so the URL always names the subject actually shown.
 */
export function ClassBoardRoute() {
  const { classId = '', subjectId } = useParams<{ classId: string; subjectId?: string }>()
  const navigate = useNavigate()

  const { status: classStatus, classRow } = useClassLookup(classId)

  const subjects = useLiveQuery(() => listSubjectsForClass(classId), [classId])
  const students = useLiveQuery(() => listStudentsForClass(classId), [classId])

  const studentIds = useMemo(() => (students ?? []).map((s) => s.id), [students])
  const subjectIds = useMemo(() => (subjects ?? []).map((s) => s.id), [subjects])

  const progress = useLiveQuery(() => listProgressForStudents(studentIds), [studentIds])
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

  if (subjects === undefined || students === undefined || progress === undefined || lessons === undefined) {
    return (
      <div role="status">
        <p>Loading…</p>
      </div>
    )
  }

  if (subjects.length > 0) {
    const activeSubject = subjects.find((s) => s.id === subjectId) ?? subjects[0]
    if (activeSubject.id !== subjectId) {
      return <Navigate to={`/class/${classId}/subject/${activeSubject.id}`} replace />
    }
  }

  return (
    <ClassBoard
      classRow={classRow!}
      subjects={subjects}
      students={students}
      progress={progress}
      lessons={lessons}
      activeSubjectId={subjectId}
      onSubjectChange={(nextSubjectId) => navigate(`/class/${classId}/subject/${nextSubjectId}`, { replace: true })}
      onCurriculumNavigate={(nextSubjectId) => navigate(`/class/${classId}/subject/${nextSubjectId}/curriculum`)}
      onReportNavigate={() => navigate(`/class/${classId}/report`)}
      onStudentNavigate={(studentId) => navigate(`/class/${classId}/student/${studentId}`)}
    />
  )
}
