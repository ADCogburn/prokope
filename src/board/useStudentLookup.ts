import { useEffect, useState } from 'react'
import { getStudent } from '../db'
import type { StudentRow } from '../db/schema'

export type StudentLookupStatus = 'loading' | 'found' | 'not-found'

export interface StudentLookup {
  status: StudentLookupStatus
  student: StudentRow | undefined
}

/**
 * getStudent lookup/not-found handling for StudentSummaryRoute, per #107.
 * Mirrors useClassLookup's shape: a plain useLiveQuery can't distinguish
 * "still loading" from "resolved to undefined" (not found), so this tracks
 * status explicitly the same way.
 */
export function useStudentLookup(studentId: string, classId: string): StudentLookup {
  const [status, setStatus] = useState<StudentLookupStatus>('loading')
  const [student, setStudent] = useState<StudentRow>()

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    getStudent(studentId).then((row) => {
      if (cancelled) return
      if (row && row.class_id === classId) {
        setStudent(row)
        setStatus('found')
      } else {
        setStatus('not-found')
      }
    })
    return () => {
      cancelled = true
    }
  }, [studentId, classId])

  return { status, student }
}
