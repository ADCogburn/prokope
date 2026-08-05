const PUSH_KEY = 'prokope:sync-push-watermark'
const PULL_KEY = 'prokope:sync-pull-watermark'

/**
 * The push watermark is "the updated_at of the newest local row already
 * pushed" -- everything with a later updated_at is dirty and belongs in the
 * next push batch (src/db/sync.ts's listRowsUpdatedSince). The pull
 * watermark is the server's own watermark from the last successful pull
 * response, passed back as `since` on the next one. Two separate values,
 * two separate clocks (local write time vs. server write time) -- neither
 * substitutes for the other. Persisted in localStorage, not Dexie: this is
 * the sync engine's own bookkeeping, not domain data (same rationale as
 * clientId.ts).
 */
export function getPushWatermark(): string | null {
  return localStorage.getItem(PUSH_KEY)
}

export function setPushWatermark(value: string): void {
  localStorage.setItem(PUSH_KEY, value)
}

export function getPullWatermark(): string | null {
  return localStorage.getItem(PULL_KEY)
}

export function setPullWatermark(value: string): void {
  localStorage.setItem(PULL_KEY, value)
}

// Both watermarks are meaningless once the signed-in user changes -- see
// resetLocalStore in sync/engine.ts.
export function clearWatermarks(): void {
  localStorage.removeItem(PUSH_KEY)
  localStorage.removeItem(PULL_KEY)
}
