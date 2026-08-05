import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useCarouselDrag } from './useCarouselDrag'

describe('useCarouselDrag', () => {
  it('starts at index 0 by default', () => {
    const { result } = renderHook(() => useCarouselDrag(400, 3))
    expect(result.current.index).toBe(0)
  })

  it('starts at the given initialIndex', () => {
    const { result } = renderHook(() => useCarouselDrag(400, 3, 2))
    expect(result.current.index).toBe(2)
  })

  it('goTo clamps to the valid item range', () => {
    const { result } = renderHook(() => useCarouselDrag(400, 3))

    act(() => result.current.goTo(10))
    expect(result.current.index).toBe(2)

    act(() => result.current.goTo(-5))
    expect(result.current.index).toBe(0)
  })

  it('offset tracks -index * panelWidth while not dragging', () => {
    const { result } = renderHook(() => useCarouselDrag(400, 3))

    act(() => result.current.goTo(2))
    expect(result.current.offset).toBe(-800)
  })
})
