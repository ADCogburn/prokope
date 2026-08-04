const STORAGE_KEY = 'prokope:client_id'

/**
 * Returns this device's stable, opaque client id, generating and persisting
 * one on first access. Has no backing Dexie table (per #6) -- lives in
 * localStorage instead, and this is the only place that reads/writes it.
 */
export function getClientId(): string {
  const existing = localStorage.getItem(STORAGE_KEY)
  if (existing !== null) {
    return existing
  }

  const id = crypto.randomUUID()
  localStorage.setItem(STORAGE_KEY, id)
  return id
}
