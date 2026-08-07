import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { StudentSummary } from './StudentSummary'
import { db } from '../db/schema'
import { createClass, createLesson, createStudent, createSubject, upsertProgressStep, upsertReviewFlag } from '../db'
import type { ClassRow, LessonRow, ProgressRow, ReviewFlagRow, StudentRow, SubjectRow } from '../db/schema'

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

async function seedClassWithTwoSubjects() {
  const classRow = await createClass({ user_id: 'user-1', name: 'Homeroom' })
  const student = await createStudent({ class_id: classRow.id, name: 'Emily', position: 0 })
  const math = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
  const reading = await createSubject({ class_id: classRow.id, name: 'Reading', position: 1 })
  const fractions = await createLesson({
    subject_id: math.id,
    unit: 1,
    lesson_in_unit: 1,
    title: 'Fractions',
    description: '',
  })
  const decimals = await createLesson({
    subject_id: math.id,
    unit: 1,
    lesson_in_unit: 2,
    title: 'Decimals',
    description: '',
  })
  const phonics = await createLesson({
    subject_id: reading.id,
    unit: 1,
    lesson_in_unit: 1,
    title: 'Phonics',
    description: '',
  })
  return { classRow, student, math, reading, fractions, decimals, phonics }
}

function renderSummary(props: {
  classRow: ClassRow
  student: StudentRow
  subjects: SubjectRow[]
  lessons: LessonRow[]
  progress: ProgressRow[]
  reviewFlags?: ReviewFlagRow[]
  onBack?: () => void
}) {
  return render(
    <StudentSummary
      classRow={props.classRow}
      student={props.student}
      subjects={props.subjects}
      lessons={props.lessons}
      progress={props.progress}
      reviewFlags={props.reviewFlags ?? []}
      onBack={props.onBack ?? vi.fn()}
    />,
  )
}

describe('StudentSummary', () => {
  it('renders the flagged-lesson list per subject, in curriculum order, and omits it for a subject with none flagged', async () => {
    const { classRow, student, math, reading, fractions, decimals, phonics } = await seedClassWithTwoSubjects()
    // Flag decimals and fractions out of curriculum order to prove the
    // render follows lesson (unit, lesson_in_unit) order, not flag order.
    const decimalsFlag = await upsertReviewFlag(student.id, decimals.id, true)
    const fractionsFlag = await upsertReviewFlag(student.id, fractions.id, true)

    renderSummary({
      classRow,
      student,
      subjects: [math, reading],
      lessons: [fractions, decimals, phonics],
      progress: [],
      reviewFlags: [decimalsFlag, fractionsFlag],
    })

    const mathRow = screen.getByText('Math').closest('li')!
    const flaggedLabels = [...mathRow.querySelectorAll('.student-summary__flagged-label')].map((el) => el.textContent)
    expect(flaggedLabels).toEqual(['1.1 - Fractions', '1.2 - Decimals'])
    expect(mathRow).toHaveClass('student-summary__subject-row--review')

    const readingRow = screen.getByText('Reading').closest('li')!
    expect(readingRow.querySelector('.student-summary__flagged-list')).not.toBeInTheDocument()
    expect(readingRow).not.toHaveClass('student-summary__subject-row--review')
  })

  it('removing a flag writes flagged: false to the ReviewFlag row, and the list drops it once the caller supplies fresh data', async () => {
    const { classRow, student, math, reading, fractions, phonics } = await seedClassWithTwoSubjects()
    const flag = await upsertReviewFlag(student.id, fractions.id, true)

    const view = renderSummary({
      classRow,
      student,
      subjects: [math, reading],
      lessons: [fractions, phonics],
      progress: [],
      reviewFlags: [flag],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove review flag for 1.1 - Fractions' }))

    await waitFor(async () => {
      const row = await db.review_flag.where('[student_id+lesson_id]').equals([student.id, fractions.id]).first()
      expect(row?.flagged).toBe(false)
    })

    // StudentSummary is a controlled/presentational component fed by a live
    // query in the real app (mirrors ClassBoard's convention) -- simulate
    // the next render a teacher would actually see once that query re-fires.
    view.rerender(
      <StudentSummary
        classRow={classRow}
        student={student}
        subjects={[math, reading]}
        lessons={[fractions, phonics]}
        progress={[]}
        reviewFlags={[]}
        onBack={vi.fn()}
      />,
    )

    expect(screen.queryByText('1.1 - Fractions')).not.toBeInTheDocument()
    expect(screen.getByText('Math').closest('li')).not.toHaveClass('student-summary__subject-row--review')
  })

  it('shows "Undo review flag changes" only after at least one removal this visit', async () => {
    const { classRow, student, math, reading, fractions, phonics } = await seedClassWithTwoSubjects()
    const flag = await upsertReviewFlag(student.id, fractions.id, true)

    renderSummary({
      classRow,
      student,
      subjects: [math, reading],
      lessons: [fractions, phonics],
      progress: [],
      reviewFlags: [flag],
    })

    expect(screen.queryByRole('button', { name: 'Undo review flag changes' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove review flag for 1.1 - Fractions' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Undo review flag changes' })).toBeInTheDocument(),
    )
  })

  it('one click on Undo restores every removal made during this visit, and the button disappears', async () => {
    const { classRow, student, math, fractions, decimals } = await seedClassWithTwoSubjects()
    const fractionsFlag = await upsertReviewFlag(student.id, fractions.id, true)
    const decimalsFlag = await upsertReviewFlag(student.id, decimals.id, true)

    renderSummary({
      classRow,
      student,
      subjects: [math],
      lessons: [fractions, decimals],
      progress: [],
      reviewFlags: [fractionsFlag, decimalsFlag],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove review flag for 1.1 - Fractions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove review flag for 1.2 - Decimals' }))

    await waitFor(async () => {
      expect((await db.review_flag.where('[student_id+lesson_id]').equals([student.id, fractions.id]).first())?.flagged).toBe(false)
      expect((await db.review_flag.where('[student_id+lesson_id]').equals([student.id, decimals.id]).first())?.flagged).toBe(false)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Undo review flag changes' }))

    await waitFor(async () => {
      expect((await db.review_flag.where('[student_id+lesson_id]').equals([student.id, fractions.id]).first())?.flagged).toBe(true)
      expect((await db.review_flag.where('[student_id+lesson_id]').equals([student.id, decimals.id]).first())?.flagged).toBe(true)
    })
    expect(screen.queryByRole('button', { name: 'Undo review flag changes' })).not.toBeInTheDocument()
  })

  it('the undo state is page-visit-scoped: it disappears once the teacher navigates away, and does not return on navigating back', async () => {
    const { classRow, student, math, fractions } = await seedClassWithTwoSubjects()
    const flag = await upsertReviewFlag(student.id, fractions.id, true)

    function Harness() {
      const navigate = useNavigate()
      return (
        <StudentSummary
          classRow={classRow}
          student={student}
          subjects={[math]}
          lessons={[fractions]}
          progress={[]}
          reviewFlags={[flag]}
          onBack={() => navigate('/away')}
        />
      )
    }

    function AwayStub() {
      const navigate = useNavigate()
      return (
        <div>
          <p>Away stub</p>
          <button type="button" onClick={() => navigate('/summary')}>
            Return to summary
          </button>
        </div>
      )
    }

    render(
      <MemoryRouter initialEntries={['/summary']}>
        <Routes>
          <Route path="/summary" element={<Harness />} />
          <Route path="/away" element={<AwayStub />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove review flag for 1.1 - Fractions' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Undo review flag changes' })).toBeInTheDocument(),
    )

    // Navigate away from Student Summary -- a real route change, not a timer.
    fireEvent.click(screen.getByRole('button', { name: '← Back' }))
    await waitFor(() => expect(screen.getByText('Away stub')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Undo review flag changes' })).not.toBeInTheDocument()

    // Navigate back to Student Summary -- a fresh mount, so no memory of
    // this visit's removal remains.
    fireEvent.click(screen.getByRole('button', { name: 'Return to summary' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Emily' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Undo review flag changes' })).not.toBeInTheDocument()
  })

  it('does not create or touch a ReviewFlag row for a subject that has no flagged lessons', async () => {
    const { classRow, student, math, reading, phonics } = await seedClassWithTwoSubjects()
    // upsertProgressStep advances Reading's current lesson but never flags it.
    await upsertProgressStep(student.id, reading.id, { unit: phonics.unit, lesson_in_unit: phonics.lesson_in_unit })

    renderSummary({
      classRow,
      student,
      subjects: [math, reading],
      lessons: [phonics],
      progress: [],
      reviewFlags: [],
    })

    expect(screen.queryByRole('button', { name: /Remove review flag/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo review flag changes' })).not.toBeInTheDocument()
  })
})
