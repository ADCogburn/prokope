import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { StudentReport } from './StudentReport'
import type { StudentReportData } from './studentReportData'
import type { StudentRow, SubjectRow } from '../db/schema'

function studentRow(overrides: Partial<StudentRow> = {}): StudentRow {
  return {
    id: 'student1',
    class_id: 'class1',
    name: 'Emily',
    position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  }
}

function subjectRow(overrides: Partial<SubjectRow> = {}): SubjectRow {
  return {
    id: 'subj1',
    class_id: 'class1',
    name: 'Math',
    position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  }
}

describe('StudentReport', () => {
  it("renders the student's name as the page heading", () => {
    const data: StudentReportData = { student: studentRow({ name: 'Emily' }), subjectRows: [] }

    render(<StudentReport data={data} />)

    expect(screen.getByRole('heading', { name: 'Emily' })).toBeInTheDocument()
  })

  it("shows each subject's current lesson label", () => {
    const data: StudentReportData = {
      student: studentRow(),
      subjectRows: [
        { subject: subjectRow({ id: 's1', name: 'Math' }), lessonLabel: '1.1 - Fractions', hasLessons: true, reviewFlagged: false },
      ],
    }

    render(<StudentReport data={data} />)

    const row = screen.getByRole('row', { name: /Math/ })
    expect(within(row).getByText('1.1 - Fractions')).toBeInTheDocument()
  })

  it('shows "Not started" for a subject with lessons but no progress yet', () => {
    const data: StudentReportData = {
      student: studentRow(),
      subjectRows: [
        { subject: subjectRow({ id: 's1', name: 'Math' }), lessonLabel: undefined, hasLessons: true, reviewFlagged: false },
      ],
    }

    render(<StudentReport data={data} />)

    expect(screen.getByText('Not started')).toBeInTheDocument()
  })

  it('shows "No lessons yet" for a subject with no lessons defined', () => {
    const data: StudentReportData = {
      student: studentRow(),
      subjectRows: [
        { subject: subjectRow({ id: 's1', name: 'Math' }), lessonLabel: undefined, hasLessons: false, reviewFlagged: false },
      ],
    }

    render(<StudentReport data={data} />)

    expect(screen.getByText('No lessons yet')).toBeInTheDocument()
  })

  it('shows a review-flag indicator only for flagged subjects', () => {
    const data: StudentReportData = {
      student: studentRow(),
      subjectRows: [
        { subject: subjectRow({ id: 's1', name: 'Math' }), lessonLabel: '1.1 - Fractions', hasLessons: true, reviewFlagged: true },
        { subject: subjectRow({ id: 's2', name: 'Reading' }), lessonLabel: '1.1 - Sight Words', hasLessons: true, reviewFlagged: false },
      ],
    }

    render(<StudentReport data={data} />)

    const mathRow = screen.getByRole('row', { name: /Math/ })
    const readingRow = screen.getByRole('row', { name: /Reading/ })
    expect(within(mathRow).getByText('Flagged for review')).toBeInTheDocument()
    expect(within(readingRow).queryByText('Flagged for review')).not.toBeInTheDocument()
  })
})
