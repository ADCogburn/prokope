// localStorage, not the Dexie local-first store: auth state isn't domain
// data and isn't part of the sync protocol (#19/#20). See #18.
export const AUTH_TOKEN_STORAGE_KEY = 'prokope.auth-token'
