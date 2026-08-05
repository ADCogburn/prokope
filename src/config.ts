// The SPA (Cloudflare Pages) and API (Railway) are different origins (per
// #9), so calls to the API need its absolute origin, not a relative path.
// VITE_API_URL is a public, build-time value set in Cloudflare Pages' env
// config, per #10's per-provider secrets convention -- same pattern as the
// Google client ID. Falls back to the API's local dev port
// (server/Properties/launchSettings.json) so `npm run dev` works untouched.
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5083'
