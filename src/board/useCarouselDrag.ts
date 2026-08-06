import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * Drag-to-spin carousel: pans continuously while dragging, then snaps to
 * the nearest panel on release. Ported from the Variant B prototype
 * (src/prototype/class-board, captured on prototype/22-class-board-variants)
 * unchanged -- it's pure interaction logic, no styling or data dependency.
 */
export function useCarouselDrag(panelWidth: number, itemCount: number, initialIndex = 0) {
  const [index, setIndex] = useState(initialIndex)
  const [dragPx, setDragPx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.button !== 0) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    startX.current = e.clientX
    setDragging(true)
  }, [])

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!dragging) return
      setDragPx(e.clientX - startX.current)
    },
    [dragging],
  )

  const onPointerUp = useCallback(() => {
    setDragging(false)
    setIndex((prev) => {
      const shifted = prev - dragPx / panelWidth
      return Math.max(0, Math.min(itemCount - 1, Math.round(shifted)))
    })
    setDragPx(0)
  }, [dragPx, panelWidth, itemCount])

  const offset = -index * panelWidth + (dragging ? dragPx : 0)

  return {
    index,
    offset,
    dragging,
    goTo: (i: number) => setIndex(Math.max(0, Math.min(itemCount - 1, i))),
    bind: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  }
}
