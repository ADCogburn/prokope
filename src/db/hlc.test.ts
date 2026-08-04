import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHlcGenerator } from './hlc'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createHlcGenerator', () => {
  it('produces a sortable string value', () => {
    const nextHlc = createHlcGenerator()

    expect(typeof nextHlc()).toBe('string')
  })

  it('produces strictly increasing values across distinct physical timestamps', () => {
    const nextHlc = createHlcGenerator()
    const nowSpy = vi.spyOn(Date, 'now')

    nowSpy.mockReturnValue(1_000)
    const first = nextHlc()
    nowSpy.mockReturnValue(2_000)
    const second = nextHlc()

    expect(second > first).toBe(true)
  })

  it('produces strictly increasing values when the physical clock does not advance', () => {
    const nextHlc = createHlcGenerator()
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(5_000)

    const first = nextHlc()
    const second = nextHlc()
    const third = nextHlc()

    expect(second > first).toBe(true)
    expect(third > second).toBe(true)
  })

  it('produces strictly increasing values when the physical clock moves backwards', () => {
    const nextHlc = createHlcGenerator()
    const nowSpy = vi.spyOn(Date, 'now')

    nowSpy.mockReturnValue(9_000)
    const first = nextHlc()
    nowSpy.mockReturnValue(1_000)
    const second = nextHlc()

    expect(second > first).toBe(true)
  })

  it('is independent per generator instance', () => {
    const generatorA = createHlcGenerator()
    const generatorB = createHlcGenerator()
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1_000)

    expect(generatorA()).toBe(generatorB())
  })
})
