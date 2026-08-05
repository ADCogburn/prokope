import { useState } from 'react'
import type { SubjectRow } from '../db/schema'
import { reorderSubjects } from '../db'
import './SubjectReorder.css'

const ABBREVIATE_AT = 12

export function abbreviateSubjectName(name: string): string {
  return name.length > ABBREVIATE_AT ? `${name.slice(0, ABBREVIATE_AT - 1)}…` : name
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

interface SubjectReorderProps {
  subjects: SubjectRow[]
  activeIndex: number
  onDotClick: (index: number) => void
}

/**
 * The dots-row pencil/chip/checkmark reorder interaction, per #59: clicking
 * the pencil stages the dots as draggable name chips in local state only;
 * reorderSubjects is called (writing to the db) solely on checkmark click.
 * Unmounting mid-edit (e.g. navigating away) drops the staged state as-is --
 * no explicit discard handler needed.
 */
export function SubjectReorder({ subjects, activeIndex, onDotClick }: SubjectReorderProps) {
  const [staged, setStaged] = useState<SubjectRow[] | undefined>(undefined)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!staged) return
    setSaving(true)
    await reorderSubjects(staged.map((subject) => subject.id))
    setSaving(false)
    setStaged(undefined)
  }

  if (!staged) {
    return (
      <div className="subject-reorder">
        <div className="subject-reorder__dots">
          {subjects.map((subject, i) => (
            <button
              key={subject.id}
              type="button"
              aria-label={`Go to ${subject.name}`}
              onClick={() => onDotClick(i)}
              className={`subject-reorder__dot${i === activeIndex ? ' subject-reorder__dot--active' : ''}`}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label="Reorder subjects"
          className="subject-reorder__pencil"
          onClick={() => setStaged(subjects)}
        >
          ✎
        </button>
      </div>
    )
  }

  return (
    <div className="subject-reorder subject-reorder--editing">
      <div className="subject-reorder__chips">
        {staged.map((subject, i) => (
          <div
            key={subject.id}
            className="subject-reorder__chip"
            draggable
            onDragStart={() => setDraggedIndex(i)}
            onDragOver={(event) => {
              event.preventDefault()
              if (draggedIndex === null || draggedIndex === i) return
              setStaged((current) => (current ? moveItem(current, draggedIndex, i) : current))
              setDraggedIndex(i)
            }}
            onDragEnd={() => setDraggedIndex(null)}
          >
            <span className="subject-reorder__chip-icon" aria-hidden="true">
              🗎
            </span>
            <span className="subject-reorder__chip-name">{abbreviateSubjectName(subject.name)}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        aria-label="Save subject order"
        className="subject-reorder__check"
        onClick={() => void handleSave()}
        disabled={saving}
      >
        ✓
      </button>
    </div>
  )
}
