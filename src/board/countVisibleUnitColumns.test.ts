import { describe, expect, it } from 'vitest'
import { countVisibleUnitColumns } from './countVisibleUnitColumns'

describe('countVisibleUnitColumns', () => {
  it('floors to the number of whole columns that fit', () => {
    expect(countVisibleUnitColumns(1000, 300)).toBe(3)
  })

  it('fits exactly when the container is an exact multiple of the column width', () => {
    expect(countVisibleUnitColumns(900, 300)).toBe(3)
  })

  it('returns 1 when the container is narrower than a single column', () => {
    expect(countVisibleUnitColumns(200, 300)).toBe(1)
  })

  it('returns 1 for a zero-width container', () => {
    expect(countVisibleUnitColumns(0, 300)).toBe(1)
  })

  it('returns 1 for a zero or negative column width', () => {
    expect(countVisibleUnitColumns(1000, 0)).toBe(1)
    expect(countVisibleUnitColumns(1000, -50)).toBe(1)
  })
})
