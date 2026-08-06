import { useRef, useState, type FormEvent } from 'react'
import './InlineRenameField.css'

interface InlineRenameFieldProps {
  ariaLabel: string
  initialValue: string
  onSubmit: (trimmedValue: string) => void | Promise<void>
  onCancel: () => void
}

/**
 * Generic single-field inline-edit swap, per #33: an autofocused text input
 * that commits on Enter or blur and discards on Escape, matching ADR-0003's
 * inline-over-modal preference for anything that collects free text. Reused
 * for the three #33 rename affordances that touch exactly one field --
 * class name, subject name (both places it's shown), and student name. The
 * two-field lesson edit is its own inline form instead (mirrors
 * AddLessonCard), since a single-input swap doesn't fit two fields.
 *
 * A caller is expected to unmount this component (return to display mode)
 * from within `onSubmit`/`onCancel` once it resolves. Enter triggers a
 * commit that unmounts this field; the resulting DOM removal can itself
 * fire a native blur, which would otherwise re-trigger the same commit --
 * `committedRef` is set synchronously by the first commit/cancel so a
 * late-firing blur from unmounting is always a no-op.
 */
export function InlineRenameField({ ariaLabel, initialValue, onSubmit, onCancel }: InlineRenameFieldProps) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState('')
  const committedRef = useRef(false)

  function commit() {
    if (committedRef.current) return
    const trimmed = value.trim()
    if (trimmed === '') {
      setError('Name cannot be empty.')
      return
    }
    committedRef.current = true
    void onSubmit(trimmed)
  }

  function cancel() {
    if (committedRef.current) return
    committedRef.current = true
    onCancel()
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    commit()
  }

  return (
    <form className="inline-rename-field" onSubmit={handleSubmit}>
      <input
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setError('')
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') cancel()
        }}
        autoFocus
      />
      {error !== '' && <p className="inline-rename-field__error">{error}</p>}
    </form>
  )
}
