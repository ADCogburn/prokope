# Theme preference is a local-only setting, not synced to the account

The app already syncs class/student/subject/progress data across devices via the push/pull sync protocol (#20). When adding a light/dark/system theme toggle, we considered making the choice follow the user's account the same way. We decided against it: theme is a low-stakes cosmetic preference, and syncing it would require a schema field, conflict handling, and an API round-trip for something a fresh device already handles reasonably via the "System" default. The choice is stored in `localStorage` and is per-browser only.
