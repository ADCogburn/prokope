import { useEffect, useState } from 'react'
import { initialSyncStatus, startSyncScheduler, type SyncStatus } from './scheduler'

/**
 * One scheduler per mounted consumer (just SyncStatusIndicator today): the
 * scheduler itself is cheap to start/stop, so there's no need for a
 * module-level singleton just to survive React StrictMode's mount ->
 * unmount -> mount dance in dev.
 */
export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(initialSyncStatus)

  useEffect(() => {
    const scheduler = startSyncScheduler()
    setStatus(scheduler.getStatus())
    const unsubscribe = scheduler.subscribe(setStatus)

    return () => {
      unsubscribe()
      scheduler.stop()
    }
  }, [])

  return status
}
