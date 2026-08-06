# Curriculum editing is a separate view from the Class Board, not inline in it

The Class Board's subject panels only ever rendered student×progress cells; lessons were read internally (`findNextLesson`) but never displayed as a list. When designing the add-lesson flow (#35), we considered adding a lesson list directly into the existing subject panel versus building a dedicated per-subject curriculum view (`/class/:classId/subject/:subjectId/curriculum`). We chose the dedicated view: curriculum authoring (defining what lessons exist) and daily progress-marking (advancing students through them) are different activities with different frequencies, and mixing a lesson-editing list into the panel that's meant for fast daily use would crowd it.

A subject with zero lessons still surfaces this from the board itself — its panel shows "This Subject is empty." with a link into the curriculum view — so the two views stay connected without merging.
