import { useCallback, useState } from 'react'

export interface UnitWindow {
  /** Index of the first visible unit column. */
  startIndex: number
  /** Index one past the last visible unit column (i.e. an exclusive end, like Array.slice). */
  endIndex: number
  canGoPrev: boolean
  canGoNext: boolean
  /** Shifts the visible window one unit forward. A no-op once the window already reaches the last unit. */
  next: () => void
  /** Shifts the visible window one unit backward. A no-op once the window is already at index 0. */
  prev: () => void
}

/**
 * Sliding-window unit navigation for the Curriculum page's forthcoming
 * unit-column carousel, per #109 (prefactor for #106). Distinct from
 * useCarouselDrag's single-focused-item model: this tracks a window of
 * `visibleCount` consecutive units, and each next()/prev() call shifts that
 * window by exactly one unit rather than jumping a full page or snapping to
 * a single index. Clamped so `startIndex` never goes negative and the
 * window never extends past `totalUnits` -- both arrows naturally have
 * nothing to do (canGoNext/canGoPrev both false) once every unit already
 * fits within `visibleCount`.
 */
export function useUnitWindow(totalUnits: number, visibleCount: number, initialIndex = 0): UnitWindow {
  const maxStartIndex = Math.max(totalUnits - visibleCount, 0)
  const clamp = useCallback((index: number) => Math.max(0, Math.min(maxStartIndex, index)), [maxStartIndex])

  const [rawStartIndex, setRawStartIndex] = useState(initialIndex)
  const startIndex = clamp(rawStartIndex)

  const next = useCallback(() => setRawStartIndex((current) => clamp(current) + 1), [clamp])
  const prev = useCallback(() => setRawStartIndex((current) => clamp(current) - 1), [clamp])

  return {
    startIndex,
    endIndex: Math.min(startIndex + visibleCount, totalUnits),
    canGoPrev: startIndex > 0,
    canGoNext: startIndex < maxStartIndex,
    next,
    prev,
  }
}
