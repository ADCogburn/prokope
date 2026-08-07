import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SkipLessonsPanel, type SkipEntry } from './SkipLessonsPanel'
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

const weekDates = [
  new Date(2024, 0, 1), // Monday
  new Date(2024, 0, 2), // Tuesday
  new Date(2024, 0, 3), // Wednesday
  new Date(2024, 0, 4), // Thursday
  new Date(2024, 0, 5), // Friday
]

function expandPanel() {
  fireEvent.click(screen.getByRole('button', { name: '+ Skip' }))
}

describe('SkipLessonsPanel', () => {
  it('starts collapsed and expands into the draft form on click', () => {
    render(
      <SkipLessonsPanel subjects={[subjectRow()]} weekDates={weekDates} entries={[]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    )

    expect(screen.queryByRole('combobox', { name: 'Skip type' })).not.toBeInTheDocument()

    expandPanel()

    expect(screen.getByRole('combobox', { name: 'Skip type' })).toBeInTheDocument()
  })

  it('shows a checkbox per subject in "Skip Individual Lessons" mode and hides them in "Skip Day(s)" mode', () => {
    render(
      <SkipLessonsPanel
        subjects={[subjectRow({ id: 's1', name: 'Math' }), subjectRow({ id: 's2', name: 'Reading' })]}
        weekDates={weekDates}
        entries={[]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expandPanel()

    expect(screen.getByRole('checkbox', { name: 'Math' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Reading' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Skip type' }), { target: { value: 'day' } })

    expect(screen.queryByRole('checkbox', { name: 'Math' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Reading' })).not.toBeInTheDocument()
  })

  it('shows a checkbox for every day currently in the report week, regardless of mode', () => {
    render(
      <SkipLessonsPanel subjects={[subjectRow()]} weekDates={weekDates} entries={[]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    )

    expandPanel()

    expect(screen.getByRole('checkbox', { name: 'Monday 1/1' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Tuesday 1/2' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Wednesday 1/3' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Thursday 1/4' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Friday 1/5' })).toBeInTheDocument()
  })

  it('blocks confirm until a day, a reason, and (in individual mode) a subject are all provided', () => {
    render(
      <SkipLessonsPanel
        subjects={[subjectRow({ id: 's1', name: 'Math' })]}
        weekDates={weekDates}
        entries={[]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expandPanel()
    const confirm = screen.getByRole('button', { name: 'Add skip' })
    expect(confirm).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Monday 1/1' }))
    expect(confirm).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Math' }))
    expect(confirm).toBeDisabled()

    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Field trip' } })
    expect(confirm).not.toBeDisabled()
  })

  it('does not require a subject to be checked in "Skip Day(s)" mode', () => {
    render(
      <SkipLessonsPanel
        subjects={[subjectRow({ id: 's1', name: 'Math' })]}
        weekDates={weekDates}
        entries={[]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expandPanel()
    fireEvent.change(screen.getByRole('combobox', { name: 'Skip type' }), { target: { value: 'day' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Monday 1/1' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Holiday' } })

    expect(screen.getByRole('button', { name: 'Add skip' })).not.toBeDisabled()
  })

  it('confirming an "Skip Individual Lessons" entry composes one exception per selected subject x day and clears the draft form', () => {
    const onAdd = vi.fn()
    render(
      <SkipLessonsPanel
        subjects={[subjectRow({ id: 's1', name: 'Math' }), subjectRow({ id: 's2', name: 'Reading' })]}
        weekDates={weekDates}
        entries={[]}
        onAdd={onAdd}
        onRemove={vi.fn()}
      />,
    )

    expandPanel()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Math' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wednesday 1/3' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Field trip' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add skip' }))

    expect(onAdd).toHaveBeenCalledTimes(1)
    const entry = onAdd.mock.calls[0][0] as SkipEntry
    expect(entry.exceptions).toEqual([{ subjectId: 's1', date: weekDates[2], reason: 'Field trip' }])

    // form collapses back to the "+ Skip" button and the draft is cleared
    expect(screen.getByRole('button', { name: '+ Skip' })).toBeInTheDocument()
  })

  it('confirming a "Skip Day(s)" entry composes one exception per subject for the selected day(s)', () => {
    const onAdd = vi.fn()
    render(
      <SkipLessonsPanel
        subjects={[subjectRow({ id: 's1', name: 'Math' }), subjectRow({ id: 's2', name: 'Reading' })]}
        weekDates={weekDates}
        entries={[]}
        onAdd={onAdd}
        onRemove={vi.fn()}
      />,
    )

    expandPanel()
    fireEvent.change(screen.getByRole('combobox', { name: 'Skip type' }), { target: { value: 'day' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Friday 1/5' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Holiday - Easter' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add skip' }))

    const entry = onAdd.mock.calls[0][0] as SkipEntry
    expect(entry.exceptions).toEqual([
      { subjectId: 's1', date: weekDates[4], reason: 'Holiday - Easter' },
      { subjectId: 's2', date: weekDates[4], reason: 'Holiday - Easter' },
    ])
  })

  it('renders the Subjects and Days fieldsets side by side as two columns, each still a single vertical checkbox list', () => {
    render(
      <SkipLessonsPanel
        subjects={[subjectRow({ id: 's1', name: 'Math' }), subjectRow({ id: 's2', name: 'Reading' })]}
        weekDates={weekDates}
        entries={[]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expandPanel()

    const subjectsFieldset = screen.getByRole('group', { name: 'Subjects' })
    const daysFieldset = screen.getByRole('group', { name: 'Days' })

    expect(subjectsFieldset.parentElement).toBe(daysFieldset.parentElement)
    expect(subjectsFieldset.parentElement).toHaveClass('skip-lessons__fieldsets')
    expect(subjectsFieldset.className).toContain('skip-lessons__fieldset')
    expect(daysFieldset.className).toContain('skip-lessons__fieldset')
  })

  it('lists already-added entries and removes one when its Remove button is clicked', () => {
    const onRemove = vi.fn()
    const entries: SkipEntry[] = [
      { id: 'entry1', summary: 'Math — Wednesday 1/3 — field trip', exceptions: [] },
      { id: 'entry2', summary: 'All subjects — Friday 1/5 — Holiday - Easter', exceptions: [] },
    ]

    render(
      <SkipLessonsPanel subjects={[subjectRow()]} weekDates={weekDates} entries={entries} onAdd={vi.fn()} onRemove={onRemove} />,
    )

    expect(screen.getByText('Math — Wednesday 1/3 — field trip')).toBeInTheDocument()
    expect(screen.getByText('All subjects — Friday 1/5 — Holiday - Easter')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])

    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledWith('entry1')
  })
})
