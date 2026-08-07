# Single accent color replaces the per-subject curated palette

Supersedes [ADR-0002](0002-curated-subject-color-palette.md). `Subject` never grew a persisted color field, and every subject header now uses one fixed accent color (`--accent`, purple, in `src/index.css`) instead of a per-subject choice. Teachers preferred the simpler, consistent look, and it sidesteps ADR-0002's header-text contrast problem entirely rather than just curating around it. One consequence: a Class Template never needs to capture subject color when recreating Subjects — there isn't any to capture.
