import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { abbreviateSubjectName, SubjectReorder } from './SubjectReorder'
import { db } from '../db/schema'
import { createSubject } from '../db'

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

async function seedTwoSubjects() {
  const math = await createSubject({ class_id: 'class-1', name: 'Math', position: 0 })
  const reading = await createSubject({ class_id: 'class-1', name: 'Reading', position: 1 })
  return { math, reading }
}

describe('abbreviateSubjectName', () => {
  it('leaves short names untouched', () => {
    expect(abbreviateSubjectName('Math')).toBe('Math')
  })

  it('truncates long names with an ellipsis', () => {
    expect(abbreviateSubjectName('Advanced Placement Chemistry')).toBe('Advanced Pl…')
  })
})

describe('SubjectReorder', () => {
  it('shows a dot per subject and a pencil button, with no chips yet', async () => {
    const { math, reading } = await seedTwoSubjects()

    render(<SubjectReorder subjects={[math, reading]} activeIndex={0} onDotClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Go to Math' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go to Reading' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reorder subjects' })).toBeInTheDocument()
    expect(screen.queryByText('Math', { selector: '.subject-reorder__chip-name' })).not.toBeInTheDocument()
  })

  it('calls onDotClick with the clicked dot index', async () => {
    const { math, reading } = await seedTwoSubjects()
    const onDotClick = vi.fn()

    render(<SubjectReorder subjects={[math, reading]} activeIndex={0} onDotClick={onDotClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Go to Reading' }))

    expect(onDotClick).toHaveBeenCalledWith(1)
  })

  it('clicking the pencil swaps the dots for draggable name chips', async () => {
    const { math, reading } = await seedTwoSubjects()

    render(<SubjectReorder subjects={[math, reading]} activeIndex={0} onDotClick={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reorder subjects' }))

    expect(screen.queryByRole('button', { name: 'Go to Math' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save subject order' })).toBeInTheDocument()
    expect(screen.getByText('Math')).toBeInTheDocument()
    expect(screen.getByText('Reading')).toBeInTheDocument()
  })

  it('dragging a chip reorders the chips locally without writing to the db', async () => {
    const { math, reading } = await seedTwoSubjects()

    render(<SubjectReorder subjects={[math, reading]} activeIndex={0} onDotClick={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reorder subjects' }))

    const chipNames = () => screen.getAllByText(/Math|Reading/).map((el) => el.textContent)
    expect(chipNames()).toEqual(['Math', 'Reading'])

    fireEvent.dragStart(screen.getByText('Math'))
    fireEvent.dragOver(screen.getByText('Reading'))

    expect(chipNames()).toEqual(['Reading', 'Math'])

    const rows = await db.subject.where('class_id').equals('class-1').toArray()
    expect(rows.find((r) => r.id === math.id)?.position).toBe(0)
    expect(rows.find((r) => r.id === reading.id)?.position).toBe(1)
  })

  it('clicking the checkmark saves the staged order via reorderSubjects and returns to dots', async () => {
    const { math, reading } = await seedTwoSubjects()

    render(<SubjectReorder subjects={[math, reading]} activeIndex={0} onDotClick={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reorder subjects' }))
    fireEvent.dragStart(screen.getByText('Math'))
    fireEvent.dragOver(screen.getByText('Reading'))
    fireEvent.click(screen.getByRole('button', { name: 'Save subject order' }))

    await waitFor(async () => {
      const rows = await db.subject.where('class_id').equals('class-1').toArray()
      expect(rows.find((r) => r.id === reading.id)?.position).toBe(0)
      expect(rows.find((r) => r.id === math.id)?.position).toBe(1)
    })

    expect(screen.getByRole('button', { name: 'Go to Math' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save subject order' })).not.toBeInTheDocument()
  })

  it('unmounting while a reorder is staged but unsaved leaves the persisted order unchanged', async () => {
    const { math, reading } = await seedTwoSubjects()

    const { unmount } = render(<SubjectReorder subjects={[math, reading]} activeIndex={0} onDotClick={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reorder subjects' }))
    fireEvent.dragStart(screen.getByText('Math'))
    fireEvent.dragOver(screen.getByText('Reading'))

    unmount()

    const rows = await db.subject.where('class_id').equals('class-1').toArray()
    expect(rows.find((r) => r.id === math.id)?.position).toBe(0)
    expect(rows.find((r) => r.id === reading.id)?.position).toBe(1)
  })
})
