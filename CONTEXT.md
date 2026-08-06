# Context: prokope

## Glossary

**Advance** — the Progress Cell control that moves a single student forward one lesson in a subject's curriculum. Bulk Advance extends this across every student in a class at once.

**Bulk Advance** — a teacher action on the Class Board that advances every student in a class one lesson at once, in a single click. Scoped to one subject: whichever subject is currently in focus on the Class Board's carousel (the panel at full opacity). Students already on that subject's last lesson (or a subject with no lessons) are silently skipped, matching the single-student advance button's existing behavior. See [ADR-0005](docs/adr/0005-bulk-progress-advance-is-scoped-to-one-subject.md).

**Un-advance** — the Progress Cell right-click menu option (see [ADR-0006](docs/adr/0006-right-click-for-progress-cell-options.md)) that moves a single student back one lesson — the inverse of Advance. Distinct from "Jump to lesson...", which can move a student to any position, including backward; Un-advance is a one-click shortcut for the common single-step case (see [ADR-0007](docs/adr/0007-un-advance-kept-separate-from-jump-to-lesson.md)). At the first lesson, un-advancing returns the student to "Not started."
