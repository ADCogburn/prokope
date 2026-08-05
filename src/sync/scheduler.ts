import { onLocalWrite } from '../db/writes'
import { pull, push } from './engine'

export type SyncStatus = 'synced' | 'syncing' | 'not-connected'

export interface SyncScheduler {
  getStatus(): SyncStatus
  subscribe(listener: (status: SyncStatus) => void): () => void
  stop(): void
}

// Coalesces a burst of edits (e.g. dragging through several progress cells)
// into one push instead of one per row.
const WRITE_DEBOUNCE_MS = 1_500
const BASE_BACKOFF_MS = 3_000
const MAX_BACKOFF_MS = 2 * 60_000

/**
 * What the status would be if a sync attempt hasn't resolved yet -- shared
 * by startSyncScheduler's own initial value and useSyncStatus's lazy
 * useState initializer, so the indicator's first paint already reflects
 * offline state instead of defaulting to "synced" and correcting a frame
 * later (the exact disconnect-masking #21 exists to avoid).
 */
export function initialSyncStatus(): SyncStatus {
  return navigator.onLine ? 'synced' : 'not-connected'
}

/**
 * Owns *when* #20's push()/pull() run and the status the teacher sees, per
 * #21/#7: debounced-on-write, reconnect, and foreground triggers -- no
 * polling -- plus exponential backoff on failure, reset on the next
 * success. Entity CRUD modules (classes.ts, etc.) never await this; a write
 * is never blocked on network state, only followed by a later, independent
 * sync attempt.
 */
export function startSyncScheduler(): SyncScheduler {
  let status: SyncStatus = initialSyncStatus()
  let stopped = false
  let inFlight: Promise<void> | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let backoffTimer: ReturnType<typeof setTimeout> | null = null
  let backoffDelay = BASE_BACKOFF_MS
  // Applying a pull's or push's response writes the same tables onWrite
  // observes (src/db/sync.ts's putRawX), which would otherwise re-arm the
  // write debounce after every successful sync and churn out an extra,
  // empty pull each time. Suppress onWrite for the duration of our own
  // attempt; a real concurrent edit isn't lost, just picked up by whatever
  // trigger fires next, since dirty rows are tracked by watermark, not by
  // whether onWrite happened to fire for them.
  let applyingRemoteWrites = false
  const listeners = new Set<(status: SyncStatus) => void>()

  function setStatus(next: SyncStatus): void {
    if (status === next) return
    status = next
    listeners.forEach((listener) => listener(status))
  }

  function clearBackoffTimer(): void {
    if (backoffTimer !== null) {
      clearTimeout(backoffTimer)
      backoffTimer = null
    }
  }

  function scheduleRetry(): void {
    clearBackoffTimer()
    backoffTimer = setTimeout(() => {
      backoffTimer = null
      void runSync()
    }, backoffDelay)
    backoffDelay = Math.min(backoffDelay * 2, MAX_BACKOFF_MS)
  }

  async function attemptSync(): Promise<void> {
    applyingRemoteWrites = true
    try {
      await push()
      await pull()
      backoffDelay = BASE_BACKOFF_MS
      setStatus('synced')
    } catch {
      setStatus('not-connected')
      scheduleRetry()
    } finally {
      applyingRemoteWrites = false
    }
  }

  function runSync(): Promise<void> {
    if (stopped) return Promise.resolve()
    if (inFlight) return inFlight

    // Any trigger firing means it's worth attempting now rather than
    // waiting out a pending backoff.
    clearBackoffTimer()

    if (!navigator.onLine) {
      setStatus('not-connected')
      return Promise.resolve()
    }

    setStatus('syncing')
    inFlight = attemptSync().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  function onWrite(): void {
    if (applyingRemoteWrites) return
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void runSync()
    }, WRITE_DEBOUNCE_MS)
  }

  function onOnline(): void {
    backoffDelay = BASE_BACKOFF_MS
    void runSync()
  }

  function onOffline(): void {
    setStatus('not-connected')
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      void runSync()
    }
  }

  const untapWrites = onLocalWrite(onWrite)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisibilityChange)

  // App launch is this session's first foreground moment -- sync now
  // rather than waiting for a write or an explicit foreground event.
  void runSync()

  return {
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    stop() {
      stopped = true
      if (debounceTimer !== null) clearTimeout(debounceTimer)
      clearBackoffTimer()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      untapWrites()
    },
  }
}
