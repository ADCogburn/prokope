import { db, type ClassTemplateRow } from './schema'
import { getClass } from './classes'
import { listSubjectsForClass } from './subjects'
import { listLessonsForSubjects } from './lessons'

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
