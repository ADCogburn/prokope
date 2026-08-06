import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useUnitWindow } from './useUnitWindow'

describe('useUnitWindow', () => {
  it('starts at index 0 by default, showing the first visibleCount units', () => {
    const { result } = renderHook(() => useUnitWindow(5, 2))

    expect(result.current.startIndex).toBe(0)
    expect(result.current.endIndex).toBe(2)
  })

  it('starts at the given initialIndex', () => {
    const { result } = renderHook(() => useUnitWindow(5, 2, 2))

    expect(result.current.startIndex).toBe(2)
    expect(result.current.endIndex).toBe(4)
  })

  it('next() shifts the window forward by exactly one unit', () => {
    const { result } = renderHook(() => useUnitWindow(5, 2))

    act(() => result.current.next())

    expect(result.current.startIndex).toBe(1)
    expect(result.current.endIndex).toBe(3)
  })

  it('prev() shifts the window backward by exactly one unit', () => {
    const { result } = renderHook(() => useUnitWindow(5, 2, 3))

    act(() => result.current.prev())

    expect(result.current.startIndex).toBe(2)
    expect(result.current.endIndex).toBe(4)
  })

  it('next() is a no-op once the window already reaches the last unit', () => {
    const { result } = renderHook(() => useUnitWindow(5, 2, 3))

    expect(result.current.startIndex).toBe(3)
    act(() => result.current.next())
    expect(result.current.startIndex).toBe(3)
    act(() => result.current.next())
    expect(result.current.startIndex).toBe(3)
  })

  it('prev() is a no-op at index 0', () => {
    const { result } = renderHook(() => useUnitWindow(5, 2))

    act(() => result.current.prev())

    expect(result.current.startIndex).toBe(0)
  })

  it('exposes canGoPrev/canGoNext reflecting whether either edge is reachable', () => {
    const { result } = renderHook(() => useUnitWindow(5, 2, 2))

    expect(result.current.canGoPrev).toBe(true)
    expect(result.current.canGoNext).toBe(true)

    act(() => result.current.next())
    expect(result.current.canGoNext).toBe(false)

    act(() => result.current.prev())
    act(() => result.current.prev())
    act(() => result.current.prev())
    expect(result.current.canGoPrev).toBe(false)
  })

  it('shows both canGoPrev and canGoNext false when every unit already fits in view', () => {
    const { result } = renderHook(() => useUnitWindow(3, 5))

    expect(result.current.startIndex).toBe(0)
    expect(result.current.endIndex).toBe(3)
    expect(result.current.canGoPrev).toBe(false)
    expect(result.current.canGoNext).toBe(false)
  })

  it('recovers from an out-of-range initialIndex by clamping it into range', () => {
    const { result } = renderHook(() => useUnitWindow(5, 2, 99))

    expect(result.current.startIndex).toBe(3)
    expect(result.current.endIndex).toBe(5)
  })
})
