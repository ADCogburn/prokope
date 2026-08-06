import type { LessonRow } from '../db/schema'

export interface UnitGroup {
  unit: number
  lessons: LessonRow[]
}

/**
 * Groups a subject's flat lesson list into ordered per-unit groups, per
 * #109 (prefactor for #106's Curriculum unit-column layout). Unit is a
 * derived, UI-only grouping (see the "Unit" glossary entry in CONTEXT.md) --
 * this has no notion of a unit existing with zero lessons, and it assumes
 * `lessons` is already sorted by (unit, lesson_in_unit), the same ordering
 * listLessonsForSubject already produces. Consecutive lessons sharing a unit
 * are merged into that unit's group in a single left-to-right pass; a unit
 * number reappearing non-consecutively (which shouldn't happen given sorted
 * input) would start a second group rather than merging into the first.
 */
export function groupLessonsByUnit(lessons: LessonRow[]): UnitGroup[] {
  const groups: UnitGroup[] = []
  for (const lesson of lessons) {
    const currentGroup = groups[groups.length - 1]
    if (currentGroup && currentGroup.unit === lesson.unit) {
      currentGroup.lessons.push(lesson)
    } else {
      groups.push({ unit: lesson.unit, lessons: [lesson] })
    }
  }
  return groups
}
