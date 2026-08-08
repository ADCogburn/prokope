import {
  db,
  type ClassTemplateRow,
  type SubjectTemplateRow,
  type SubjectTemplateLessonRow,
  type LessonRow,
} from './schema'
import { getClass } from './classes'
import { listSubjectsForClass } from './subjects'
import { listLessonsForSubject, listLessonsForSubjects } from './lessons'

/**
 * Class Templates (#168): snapshots a Class's current, live curriculum --
 * its Subjects and each Subject's Lessons -- into a standalone
 * class_template/class_template_subject/class_template_lesson row set.
 * Soft-deleted Subjects/Lessons are excluded (listSubjectsForClass and
 * listLessonsForSubjects already filter those out). Once written, the
 * template is a fully independent copy: later edits to or soft-deletion of
 * the source Class/Subjects/Lessons never touch it, since it's keyed by
 * user_id rather than class_id and carries its own copies of every field.
 *
 * No color capture (ADR-0014: Subjects have no persisted color field) and no
 * load/apply function ships in this ticket (ADR-0016: Class Templates ship
 * save-only).
 */
export async function saveClassTemplate(classId: string, name: string): Promise<ClassTemplateRow> {
  const sourceClass = await getClass(classId)
  if (!sourceClass) {
    throw new Error(`Class not found: ${classId}`)
  }

  const subjects = await listSubjectsForClass(classId)
  const lessons = await listLessonsForSubjects(subjects.map((subject) => subject.id))

  const now = new Date().toISOString()
  const classTemplate: ClassTemplateRow = {
    id: crypto.randomUUID(),
    user_id: sourceClass.user_id,
    name,
    created_at: now,
    updated_at: now,
  }

  await db.transaction(
    'rw',
    db.class_template,
    db.class_template_subject,
    db.class_template_lesson,
    async () => {
      await db.class_template.add(classTemplate)

      for (const subject of subjects) {
        const classTemplateSubjectId = crypto.randomUUID()
        await db.class_template_subject.add({
          id: classTemplateSubjectId,
          class_template_id: classTemplate.id,
          name: subject.name,
          position: subject.position,
          created_at: now,
          updated_at: now,
        })

        const subjectLessons = lessons.filter((lesson) => lesson.subject_id === subject.id)
        for (const lesson of subjectLessons) {
          await db.class_template_lesson.add({
            id: crypto.randomUUID(),
            class_template_subject_id: classTemplateSubjectId,
            unit: lesson.unit,
            lesson_in_unit: lesson.lesson_in_unit,
            title: lesson.title,
            description: lesson.description,
            created_at: now,
            updated_at: now,
          })
        }
      }
    },
  )

  return classTemplate
}

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
