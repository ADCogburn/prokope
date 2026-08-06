# Prokope

A local-first classroom progress tracker: a teacher tracks each student's position through each subject's curriculum.

## Language

**Class Board**:
The day-to-day view (`ClassBoard`) where a teacher marks student progress — the subject carousel plus the student roster. It is not where a subject's curriculum is authored.
_Avoid_: dashboard, home screen

**Curriculum**:
A subject's ordered list of lessons, each identified by its `{unit, lesson_in_unit}` position. Authored in a dedicated per-subject view (`/class/:classId/subject/:subjectId/curriculum`), separate from the Class Board — lesson authoring and day-to-day progress-marking are different activities with different views.
_Avoid_: lesson list, syllabus

**Progress Cell**:
One student×subject cell on the Class Board (`ProgressCell`), showing the student's current step and controls to advance or flag it for review.
_Avoid_: lesson cell, tile, cell

**Advance**:
The Progress Cell control that moves a single student forward one lesson in a subject's curriculum. Bulk Advance extends this across every student in a class at once.
_Avoid_: next, progress (as a verb)

**Un-advance**:
The Progress Cell right-click menu option (see ADR-0006) that moves a single student back one lesson — the inverse of Advance. Distinct from "Jump to lesson...", which can move a student to any position, including backward; Un-advance is a one-click shortcut for the common single-step case (see ADR-0007). At the first lesson, un-advancing returns the student to "Not started."
_Avoid_: un-progress, undo, step back

**Bulk Advance**:
The "progress all students" action that advances every student in a class one lesson at once, scoped to whichever subject is currently in focus on the Class Board's carousel. One-shot undoable (see ADR-0005 for why it doesn't span classes).
_Avoid_: group progression, mass advance, batch advance
