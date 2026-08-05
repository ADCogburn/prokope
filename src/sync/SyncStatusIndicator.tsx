import type { SyncStatus } from './scheduler'
import { useSyncStatus } from './useSyncStatus'
import './SyncStatusIndicator.css'

const LABEL: Record<SyncStatus, string> = {
  synced: 'Synced',
  syncing: 'Syncing…',
  'not-connected': 'Not connected',
}

/**
 * Always mounted, per #21/#7 -- a disconnect should be visible on its own,
 * not only discoverable later by noticing a second device is missing
 * changes.
 */
export function SyncStatusIndicator() {
  const status = useSyncStatus()

  return (
    <div className={`sync-status sync-status--${status}`} role="status" aria-live="polite">
      <span className="sync-status__dot" aria-hidden="true" />
      {LABEL[status]}
    </div>
  )
}
