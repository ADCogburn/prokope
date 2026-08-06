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
 * add-subject form).
 */
export function InlineAddCard({ addLabel, className, children }: InlineAddCardProps) {
  const [expanded, setExpanded] = useState(false)
  const collapse = () => setExpanded(false)
  const classes = `inline-add-card${className ? ` ${className}` : ''}`

  if (!expanded) {
    return (
      <button type="button" className={classes} onClick={() => setExpanded(true)}>
        + {addLabel}
      </button>
    )
  }

  return <div className={`${classes} inline-add-card--expanded`}>{children({ collapse })}</div>
}
