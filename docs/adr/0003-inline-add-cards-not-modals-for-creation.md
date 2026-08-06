# Subject/lesson creation uses inline expanding cards, not modals

For adding a subject or a lesson, we considered a modal dialog, a dedicated full-screen route (like the existing `ClassSetup` class-creation screen), and an inline expanding "+" card at the end of the relevant list. We chose the inline card: it keeps the teacher in the carousel/list they're already looking at, for what should be a frequent, low-friction action, and it avoided introducing modal infrastructure the codebase didn't have yet.

The app's first modal was introduced separately, for the book-icon "jump to a subject's curriculum" picker. That's a deliberate split, not an inconsistency: modals are reserved for navigation/picker UI (choosing among existing items), while inline expanding cards are reserved for data-entry/creation. If a future feature needs to collect input, prefer the inline-card pattern over reaching for a modal.
