import { beforeEach, describe, expect, it } from 'vitest'
import { getClientId } from './clientId'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

beforeEach(() => {
  localStorage.clear()
})

describe('getClientId', () => {
  it('returns a valid UUID', () => {
    expect(getClientId()).toMatch(UUID_PATTERN)
  })

  it('returns the same value across repeated calls', () => {
    const first = getClientId()
    const second = getClientId()

    expect(second).toBe(first)
  })

  it('persists the value in localStorage so it survives across module reloads', () => {
    const id = getClientId()

    expect(localStorage.getItem('prokope:client_id')).toBe(id)
  })

  it('reuses an id already present in localStorage instead of minting a new one', () => {
    localStorage.setItem('prokope:client_id', 'existing-id')

    expect(getClientId()).toBe('existing-id')
  })
})
