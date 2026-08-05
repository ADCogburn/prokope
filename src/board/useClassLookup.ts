import { useEffect, useState } from 'react'
import { getClass } from '../db'
import type { ClassRow } from '../db/schema'

export type ClassLookupStatus = 'loading' | 'found' | 'not-found'

export interface ClassLookup {
  status: ClassLookupStatus
  classRow: ClassRow | undefined
}

/** Shared getClass lookup/not-found handling for ClassBoardRoute and CurriculumRoute. */
export function useClassLookup(classId: string): ClassLookup {
  const [status, setStatus] = useState<ClassLookupStatus>('loading')
  const [classRow, setClassRow] = useState<ClassRow>()

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    getClass(classId).then((row) => {
      if (cancelled) return
      if (row) {
        setClassRow(row)
        setStatus('found')
      } else {
        setStatus('not-found')
      }
    })
    return () => {
      cancelled = true
    }
  }, [classId])

  return { status, classRow }
}
