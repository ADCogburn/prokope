import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './ContextMenu.css'

export interface ContextMenuItem {
  label: string
  onSelect: () => void
  disabled?: boolean
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  x: number
  y: number
  onClose: () => void
}

/**
 * Generic, reusable, presentational right-click menu (#44, per ADR-0006).
 * Item-list shape is deliberately not hard-coded to one entry, so later
 * options (e.g. Un-advance, #77) can be added without changing this
 * component. Closes itself on: selecting an item, clicking outside, or
 * pressing Escape -- the caller owns whether it's rendered at all.
 *
 * Rendered via a portal into `document.body` (#133): some triggers (e.g.
 * the Class Board carousel's transformed panels) are transformed ancestors,
 * which would otherwise reinterpret this menu's `position: fixed` x/y as
 * relative to that ancestor instead of the viewport.
 */
export function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div ref={ref} role="menu" className="context-menu" style={{ left: x, top: y }}>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className="context-menu__item"
          disabled={item.disabled}
          onClick={() => {
            item.onSelect()
            onClose()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}
