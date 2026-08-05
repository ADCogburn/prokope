import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SyncStatusIndicator } from './SyncStatusIndicator'
import { useSyncStatus } from './useSyncStatus'
import type { SyncStatus } from './scheduler'

// Isolated from SyncStatusIndicator.test.tsx's real, end-to-end render:
// this file only checks the label/class the indicator renders for each
// status, so it mocks useSyncStatus directly rather than driving a real
// scheduler through online/offline/syncing transitions.
vi.mock('./useSyncStatus')

describe('SyncStatusIndicator label per status', () => {
  it.each<[SyncStatus, string]>([
    ['synced', 'Synced'],
    ['syncing', 'Syncing…'],
    ['not-connected', 'Not connected'],
  ])('shows "%s" as "%s"', (status, label) => {
    vi.mocked(useSyncStatus).mockReturnValue(status)

    render(<SyncStatusIndicator />)

    const indicator = screen.getByRole('status')
    expect(indicator).toHaveTextContent(label)
    expect(indicator.className).toContain(`sync-status--${status}`)
  })
})
