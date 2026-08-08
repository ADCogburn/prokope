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
        { subject: subjectRow({ id: 's1', name: 'Math' }), lessonLabel: '1.1 - Fractions', hasLessons: true, flaggedLessons: [] },
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
        { subject: subjectRow({ id: 's1', name: 'Math' }), lessonLabel: undefined, hasLessons: true, flaggedLessons: [] },
      ],
    }

    render(<StudentReport data={data} />)

    expect(screen.getByText('Not started')).toBeInTheDocument()
  })

  it('shows "No lessons yet" for a subject with no lessons defined', () => {
    const data: StudentReportData = {
      student: studentRow(),
      subjectRows: [
        { subject: subjectRow({ id: 's1', name: 'Math' }), lessonLabel: undefined, hasLessons: false, flaggedLessons: [] },
      ],
    }

    render(<StudentReport data={data} />)

    expect(screen.getByText('No lessons yet')).toBeInTheDocument()
  })

  it('lists every flagged lesson for a subject, and shows nothing for a subject with none', () => {
    const data: StudentReportData = {
      student: studentRow(),
      subjectRows: [
        {
          subject: subjectRow({ id: 's1', name: 'Math' }),
          lessonLabel: '2.1 - Geometry',
          hasLessons: true,
          flaggedLessons: [
            { lessonId: 'l1', label: '1.1 - Fractions' },
            { lessonId: 'l2', label: '1.2 - Decimals' },
          ],
        },
        {
          subject: subjectRow({ id: 's2', name: 'Reading' }),
          lessonLabel: '1.1 - Sight Words',
          hasLessons: true,
          flaggedLessons: [],
        },
      ],
    }

    render(<StudentReport data={data} />)

    const mathRow = screen.getByRole('row', { name: /Math/ })
    expect(within(mathRow).getByText('1.1 - Fractions')).toBeInTheDocument()
    expect(within(mathRow).getByText('1.2 - Decimals')).toBeInTheDocument()

    const readingRow = screen.getByRole('row', { name: /Reading/ })
    expect(within(readingRow).queryByText(/Fractions|Decimals/)).not.toBeInTheDocument()
  })

  it('still shows a flagged lesson after the student has progressed past it (position-independent)', () => {
    const data: StudentReportData = {
      student: studentRow(),
      subjectRows: [
        {
          subject: subjectRow({ id: 's1', name: 'Math' }),
          lessonLabel: '2.1 - Geometry',
          hasLessons: true,
          flaggedLessons: [{ lessonId: 'l1', label: '1.1 - Fractions' }],
        },
      ],
    }

    render(<StudentReport data={data} />)

    const row = screen.getByRole('row', { name: /Math/ })
    expect(within(row).getByText('2.1 - Geometry')).toBeInTheDocument()
    expect(within(row).getByText('1.1 - Fractions')).toBeInTheDocument()
  })
})
