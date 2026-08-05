import { useState, type FormEvent } from 'react'
import { createClass } from '../db'
import type { ClassRow } from '../db/schema'
import './ClassSetup.css'

interface ClassSetupProps {
  userId: string
  onCreated: (classRow: ClassRow) => void
}

/** One-time screen shown at `/` the first time a teacher logs in and has no class yet, per #12/#22. */
export function ClassSetup({ userId, onCreated }: ClassSetupProps) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '' || submitting) {
      return
    }

    setSubmitting(true)
    const classRow = await createClass({ user_id: userId, name: trimmed })
    onCreated(classRow)
  }

  return (
    <div className="class-setup">
      <h1>Set up your class</h1>
      <p>Give your class a name to get started. You can change this later.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="class-name">Class name</label>
        <input
          id="class-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Ms. Alvarez's Class"
          autoFocus
        />
        <button type="submit" disabled={submitting || name.trim() === ''}>
          Create class
        </button>
      </form>
    </div>
  )
}
