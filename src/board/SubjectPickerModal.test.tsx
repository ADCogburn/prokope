import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SubjectPickerModal } from './SubjectPickerModal'
import type { SubjectRow } from '../db/schema'

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

describe('SubjectPickerModal', () => {
  it('lists every subject passed in as props', () => {
    render(
      <SubjectPickerModal
        subjects={[subjectRow({ id: 's1', name: 'Math' }), subjectRow({ id: 's2', name: 'Reading' })]}
        onSelectSubject={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Math' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reading' })).toBeInTheDocument()
  })

  it("calls onSelectSubject with the clicked row's subject id", () => {
    const onSelectSubject = vi.fn()
    render(
      <SubjectPickerModal
        subjects={[subjectRow({ id: 's1', name: 'Math' }), subjectRow({ id: 's2', name: 'Reading' })]}
        onSelectSubject={onSelectSubject}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reading' }))

    expect(onSelectSubject).toHaveBeenCalledWith('s2')
    expect(onSelectSubject).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<SubjectPickerModal subjects={[subjectRow()]} onSelectSubject={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<SubjectPickerModal subjects={[subjectRow()]} onSelectSubject={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('dialog').parentElement!)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when the dialog content itself is clicked', () => {
    const onClose = vi.fn()
    render(<SubjectPickerModal subjects={[subjectRow()]} onSelectSubject={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('dialog'))

    expect(onClose).not.toHaveBeenCalled()
  })
})
