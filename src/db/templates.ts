import { db, type SubjectTemplateRow, type SubjectTemplateLessonRow, type LessonRow } from './schema'
import { listLessonsForSubject } from './lessons'

/**
 * Snapshots a Subject's live (non-soft-deleted) Lessons into a reusable
 * Template, per #147/#165. Template rows are keyed by user_id directly
 * (looked up via the Subject's owning Class) rather than a Class/Subject FK
 * -- that's what lets a Template outlive its source, per #165's design.
 * Template rows are immutable once created: nothing in #147 edits or removes
 * one after saving, so there's no update path here to mirror createLesson's
 * uniqueness-guard or similar.
 */
export async function saveSubjectTemplate(subjectId: string, name: string): Promise<SubjectTemplateRow> {
  const subject = await db.subject.get(subjectId)
  if (!subject) {
    throw new Error(`Subject ${subjectId} not found`)
  }
  const owningClass = await db.class.get(subject.class_id)
  if (!owningClass) {
    throw new Error(`Class ${subject.class_id} not found`)
  }

  const lessons = await listLessonsForSubject(subjectId)
  const now = new Date().toISOString()

  const template: SubjectTemplateRow = {
    id: crypto.randomUUID(),
    user_id: owningClass.user_id,
    name,
    created_at: now,
    updated_at: now,
  }
  const templateLessons: SubjectTemplateLessonRow[] = lessons.map((lesson) => ({
    id: crypto.randomUUID(),
    subject_template_id: template.id,
    unit: lesson.unit,
    lesson_in_unit: lesson.lesson_in_unit,
    title: lesson.title,
    description: lesson.description,
    created_at: now,
    updated_at: now,
  }))

  await db.transaction('rw', db.subject_template, db.subject_template_lesson, async () => {
    await db.subject_template.add(template)
    await db.subject_template_lesson.bulkAdd(templateLessons)
  })

  return template
}

/**
 * Every Subject Template owned by `userId`, regardless of which Class/Subject
 * it was saved from or whether that source still exists -- Templates have no
 * FK back to a live Subject/Class, so this is a direct user_id lookup, not a
 * chain walk like listSubjectsForClass. Sorted by created_at so the list
 * order is deterministic (oldest first), matching getClassForUser's
 * tie-breaking convention rather than relying on unordered table order.
 */
export async function listSubjectTemplatesForUser(userId: string): Promise<SubjectTemplateRow[]> {
  return db.subject_template.where('user_id').equals(userId).sortBy('created_at')
}

/**
 * Bulk-creates Lesson rows on targetSubjectId from templateId's saved
 * lessons, per #165. No UI ships in this ticket, so there's no gap-filling
 * or conflict-avoidance logic here (unlike #162's Bulk Generate) -- this is
 * a straight recreate of every saved lesson, unit/lesson_in_unit/title/
 * description intact, under new client-generated ids on the target Subject.
 */
export async function applySubjectTemplate(templateId: string, targetSubjectId: string): Promise<LessonRow[]> {
  const templateLessons = (
    await db.subject_template_lesson.where('subject_template_id').equals(templateId).toArray()
  ).sort((a, b) => a.unit - b.unit || a.lesson_in_unit - b.lesson_in_unit)

  const now = new Date().toISOString()
  const lessons: LessonRow[] = templateLessons.map((templateLesson) => ({
    id: crypto.randomUUID(),
    subject_id: targetSubjectId,
    unit: templateLesson.unit,
    lesson_in_unit: templateLesson.lesson_in_unit,
    title: templateLesson.title,
    description: templateLesson.description,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }))

  await db.lesson.bulkAdd(lessons)
  return lessons
}
