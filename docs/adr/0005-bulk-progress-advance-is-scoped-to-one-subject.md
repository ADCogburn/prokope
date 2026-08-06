# Bulk progress advance is scoped to one subject, not "all classes"

#43 asked for a teacher-facing "progress all students one lesson" action, with two scopes: the current class, or all classes at once. Progress is tracked per `(student, subject)`, and subjects are per-class rows with no shared identity across classes — there's no principled way to know that Class A's "Math" and Class B's "Math" are "the same subject" to advance together. Building that matching (by name, by manual mapping, etc.) is a real feature in its own right, not a natural extension of this one.

We scoped Bulk Advance to a single class's currently-active subject (whichever the carousel has in focus) and dropped "all classes" from this issue. A cross-class version can be revisited later once there's an actual concept for corresponding subjects across classes.
