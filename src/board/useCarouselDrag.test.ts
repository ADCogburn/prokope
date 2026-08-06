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

  it('a primary-button pointer-down engages dragging state', () => {
    const { result } = renderHook(() => useCarouselDrag(400, 3))

    act(() =>
      result.current.bind.onPointerDown({
        button: 0,
        clientX: 0,
        pointerId: 1,
        target: { setPointerCapture: () => {} },
      } as unknown as Parameters<typeof result.current.bind.onPointerDown>[0]),
    )

    expect(result.current.dragging).toBe(true)
  })

  it('a non-primary-button pointer-down (e.g. right-click) does not engage dragging state', () => {
    const { result } = renderHook(() => useCarouselDrag(400, 3))

    act(() =>
      result.current.bind.onPointerDown({
        button: 2,
        clientX: 0,
        pointerId: 1,
        target: { setPointerCapture: () => {} },
      } as unknown as Parameters<typeof result.current.bind.onPointerDown>[0]),
    )

    expect(result.current.dragging).toBe(false)
  })
})
