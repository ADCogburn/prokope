import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SyncStatusIndicator } from './SyncStatusIndicator'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn())
})

describe('SyncStatusIndicator', () => {
  it('renders a persistent status indicator, settling on synced when signed out', async () => {
    render(<SyncStatusIndicator />)

    const indicator = await screen.findByRole('status')
    expect(indicator).toHaveTextContent('Synced')
    // Never blocks on network state -- signed-out push()/pull() no-op
    // rather than reaching the network.
    expect(fetch).not.toHaveBeenCalled()
  })
})
