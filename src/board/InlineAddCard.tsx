import { useState, type ReactNode } from 'react'
import './InlineAddCard.css'

interface InlineAddCardProps {
  addLabel: string
  className?: string
  children: (helpers: { collapse: () => void }) => ReactNode
}

/**
 * Reusable expand-in-place "+" card, per #58/#56: collapsed, it's a button;
 * clicking it swaps in caller-supplied form content (the render-prop
 * children), which receives `collapse` to call on cancel or after a
 * successful submit. Owns only expand/collapse -- fields, validation, and
 * the actual create call belong to the consumer (e.g. ClassBoard's
 * add-subject form), so #60's add-lesson flow can reuse this unchanged.
 */
export function InlineAddCard({ addLabel, className, children }: InlineAddCardProps) {
  const [expanded, setExpanded] = useState(false)
  const collapse = () => setExpanded(false)

  if (!expanded) {
    return (
      <button
        type="button"
        className={`inline-add-card${className ? ` ${className}` : ''}`}
        onClick={() => setExpanded(true)}
      >
        + {addLabel}
      </button>
    )
  }

  return (
    <div className={`inline-add-card inline-add-card--expanded${className ? ` ${className}` : ''}`}>
      {children({ collapse })}
    </div>
  )
}
