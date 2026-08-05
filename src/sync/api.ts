import type { SyncSnapshot } from '../db/sync'

// Same cross-origin setup as AuthContext.tsx: the SPA (Cloudflare Pages) and
// API (Railway) are different origins (#9), so this needs the API's
// absolute origin. Falls back to the API's local dev port so `npm run dev`
// works untouched.
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5083'

export type SyncBatch = SyncSnapshot

export interface SyncPullResult extends SyncSnapshot {
  watermark: string
}

export async function pushChanges(batch: SyncBatch, token: string): Promise<SyncBatch> {
  const response = await fetch(`${API_URL}/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(batch),
  })

  if (!response.ok) {
    throw new Error(`sync push failed with status ${response.status}`)
  }

  return (await response.json()) as SyncBatch
}

export async function pullChanges(since: string | null, token: string): Promise<SyncPullResult> {
  const url = new URL(`${API_URL}/sync/pull`)
  if (since !== null) {
    url.searchParams.set('since', since)
  }

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })

  if (!response.ok) {
    throw new Error(`sync pull failed with status ${response.status}`)
  }

  return (await response.json()) as SyncPullResult
}
