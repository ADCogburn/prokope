import { useState } from 'react'
import type { SubjectRow } from '../db/schema'
import { InlineAddCard } from './InlineAddCard'
import { formatDayHeader, type SkipException } from './weeklyLessonPlan'
import './SkipLessonsPanel.css'

type SkipMode = 'individual' | 'day'

/** One confirmed skip, per #84: the concrete per-subject/per-date exceptions it composes into, plus a human-readable summary for the review list. */
export interface SkipEntry {
  id: string
  summary: string
  exceptions: SkipException[]
}

interface SkipLessonsPanelProps {
  subjects: SubjectRow[]
  weekDates: Date[]
  entries: SkipEntry[]
  onAdd: (entry: SkipEntry) => void
  onRemove: (id: string) => void
}

/**
 * Inline "Skip" panel for the Weekly Lesson Plan report (#84), matching
 * ADR-0003's inline-expanding-card pattern rather than a modal. Two modes:
 * "Skip Individual Lessons" (pick subjects + days) and "Skip Day(s)" (every
 * subject, pick days only). Confirming composes one `SkipException` per
 * (subject, day) pair -- "Skip Day(s)" isn't a separate concept below this
 * panel, it's just every subject selected -- and hands the whole group up
 * to `Reports.tsx` as one removable `SkipEntry`. Nothing here is persisted;
 * this component only owns the in-progress draft form.
 */
export function SkipLessonsPanel({ subjects, weekDates, entries, onAdd, onRemove }: SkipLessonsPanelProps) {
  const [mode, setMode] = useState<SkipMode>('individual')
  const [subjectIds, setSubjectIds] = useState<string[]>([])
  const [dayTimes, setDayTimes] = useState<number[]>([])
  const [reason, setReason] = useState('')

  function toggleSubject(id: string) {
    setSubjectIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]))
  }

  function toggleDay(time: number) {
    setDayTimes((prev) => (prev.includes(time) ? prev.filter((existing) => existing !== time) : [...prev, time]))
  }

  function resetDraft() {
    setMode('individual')
    setSubjectIds([])
    setDayTimes([])
    setReason('')
  }

  const trimmedReason = reason.trim()
  const selectedDays = weekDates.filter((date) => dayTimes.includes(date.getTime()))
  const canConfirm = selectedDays.length > 0 && trimmedReason !== '' && (mode === 'day' || subjectIds.length > 0)

  function handleConfirm(collapse: () => void) {
    if (!canConfirm) return

    const affectedSubjects = mode === 'day' ? subjects : subjects.filter((subject) => subjectIds.includes(subject.id))
    const exceptions: SkipException[] = affectedSubjects.flatMap((subject) =>
      selectedDays.map((date) => ({ subjectId: subject.id, date, reason: trimmedReason })),
    )
    const subjectLabel = mode === 'day' ? 'All subjects' : affectedSubjects.map((subject) => subject.name).join(', ')
    const dayLabel = selectedDays.map((date) => formatDayHeader(date)).join(', ')

    onAdd({
      id: crypto.randomUUID(),
      summary: `${subjectLabel} — ${dayLabel} — ${trimmedReason}`,
      exceptions,
    })
    resetDraft()
    collapse()
  }

  return (
    <div className="skip-lessons">
      <InlineAddCard addLabel="Skip" className="skip-lessons__card">
        {({ collapse }) => (
          <div className="inline-add-card__form skip-lessons__form">
            <label htmlFor="skip-mode">Skip type</label>
            <select id="skip-mode" value={mode} onChange={(event) => setMode(event.target.value as SkipMode)}>
              <option value="individual">Skip Individual Lessons</option>
              <option value="day">Skip Day(s)</option>
            </select>

            <div className="skip-lessons__fieldsets">
              {mode === 'individual' && (
                <fieldset className="skip-lessons__fieldset">
                  <legend>Subjects</legend>
                  {subjects.map((subject) => (
                    <label key={subject.id} className="skip-lessons__checkbox">
                      <input
                        type="checkbox"
                        checked={subjectIds.includes(subject.id)}
                        onChange={() => toggleSubject(subject.id)}
                      />
                      {subject.name}
                    </label>
                  ))}
                </fieldset>
              )}

              <fieldset className="skip-lessons__fieldset">
                <legend>Days</legend>
                {weekDates.map((date) => (
                  <label key={date.toISOString()} className="skip-lessons__checkbox">
                    <input
                      type="checkbox"
                      checked={dayTimes.includes(date.getTime())}
                      onChange={() => toggleDay(date.getTime())}
                    />
                    {formatDayHeader(date)}
                  </label>
                ))}
              </fieldset>
            </div>

            <label htmlFor="skip-reason">Reason</label>
            <input
              id="skip-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. field trip"
            />

            <div className="inline-add-card__actions">
              <button
                type="button"
                onClick={() => {
                  resetDraft()
                  collapse()
                }}
              >
                Cancel
              </button>
              <button type="button" disabled={!canConfirm} onClick={() => handleConfirm(collapse)}>
                Add skip
              </button>
            </div>
          </div>
        )}
      </InlineAddCard>

      {entries.length > 0 && (
        <ul className="skip-lessons__entries">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span>{entry.summary}</span>
              <button type="button" onClick={() => onRemove(entry.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
