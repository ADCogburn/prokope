import { afterEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import { createClass } from './classes'
import { createSubject, deleteSubject, renameSubject } from './subjects'
import { createLesson, deleteLesson, updateLessonContent } from './lessons'
import { saveSubjectTemplate, listSubjectTemplatesForUser, applySubjectTemplate } from './templates'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

async function makeSubjectWithLessons(userId = 'user-1') {
  const classRow = await createClass({ user_id: userId, name: 'Room 5' })
  const subject = await createSubject({ class_id: classRow.id, name: 'Math', position: 0 })
  const first = await createLesson({
    subject_id: subject.id,
    unit: 1,
    lesson_in_unit: 1,
    title: 'Counting',
    description: 'Counting to ten',
  })
  const second = await createLesson({
    subject_id: subject.id,
    unit: 1,
    lesson_in_unit: 2,
    title: 'Addition',
    description: 'Adding small numbers',
  })
  return { classRow, subject, first, second }
}

describe('saveSubjectTemplate', () => {
  it('captures exactly the Subject live Lessons and ignores soft-deleted ones', async () => {
    const { subject, first, second } = await makeSubjectWithLessons()
    await deleteLesson(second.id)

    const template = await saveSubjectTemplate(subject.id, 'Math Template')

    expect(template.id).toMatch(UUID_PATTERN)
    expect(template.name).toBe('Math Template')

    const templateLessons = await db.subject_template_lesson
      .where('subject_template_id')
      .equals(template.id)
      .toArray()

    expect(templateLessons).toHaveLength(1)
    expect(templateLessons[0]).toMatchObject({
      unit: first.unit,
      lesson_in_unit: first.lesson_in_unit,
      title: first.title,
      description: first.description,
    })
  })

  it('derives the template user_id from the Subject owning Class', async () => {
    const { subject } = await makeSubjectWithLessons('teacher-42')

    const template = await saveSubjectTemplate(subject.id, 'Math Template')

    expect(template.user_id).toBe('teacher-42')
  })
})

describe('applySubjectTemplate', () => {
  it('recreates Lessons on the target Subject with matching unit/lesson-in-unit/title/description', async () => {
    const { subject, first, second } = await makeSubjectWithLessons()
    const template = await saveSubjectTemplate(subject.id, 'Math Template')

    const targetClass = await createClass({ user_id: 'user-2', name: 'Room 9' })
    const targetSubject = await createSubject({ class_id: targetClass.id, name: 'Math Copy', position: 0 })

    const created = await applySubjectTemplate(template.id, targetSubject.id)

    expect(created).toHaveLength(2)
    expect(created.every((lesson) => lesson.subject_id === targetSubject.id)).toBe(true)
    expect(created.every((lesson) => lesson.deleted_at === null)).toBe(true)

    const byPosition = [...created].sort((a, b) => a.unit - b.unit || a.lesson_in_unit - b.lesson_in_unit)
    expect(byPosition[0]).toMatchObject({
      unit: first.unit,
      lesson_in_unit: first.lesson_in_unit,
      title: first.title,
      description: first.description,
    })
    expect(byPosition[1]).toMatchObject({
      unit: second.unit,
      lesson_in_unit: second.lesson_in_unit,
      title: second.title,
      description: second.description,
    })
  })
})

describe('listSubjectTemplatesForUser', () => {
  it("returns only that user's Templates", async () => {
    const { subject: subjectA } = await makeSubjectWithLessons('user-a')
    const { subject: subjectB } = await makeSubjectWithLessons('user-b')

    const templateA = await saveSubjectTemplate(subjectA.id, 'A Template')
    await saveSubjectTemplate(subjectB.id, 'B Template')

    const rows = await listSubjectTemplatesForUser('user-a')

    expect(rows.map((r) => r.id)).toEqual([templateA.id])
  })

  it('returns every Template owned by the user regardless of source Class/Subject', async () => {
    const { subject: subjectA } = await makeSubjectWithLessons('user-a')
    const classRow2 = await createClass({ user_id: 'user-a', name: 'Room 6' })
    const subjectA2 = await createSubject({ class_id: classRow2.id, name: 'Reading', position: 0 })

    const templateOne = await saveSubjectTemplate(subjectA.id, 'One')
    const templateTwo = await saveSubjectTemplate(subjectA2.id, 'Two')

    const rows = await listSubjectTemplatesForUser('user-a')

    expect(rows.map((r) => r.id).sort()).toEqual([templateOne.id, templateTwo.id].sort())
  })
})

describe('a saved Template is unaffected by later changes to its source', () => {
  it('survives mutation of the source Subject', async () => {
    const { subject, first } = await makeSubjectWithLessons()
    const template = await saveSubjectTemplate(subject.id, 'Math Template')

    await renameSubject(subject.id, 'Renamed Subject')
    await updateLessonContent(first.id, {
      unit: 9,
      lesson_in_unit: 9,
      title: 'Changed Title',
      description: 'Changed description',
    })

    const templateLessons = await db.subject_template_lesson
      .where('subject_template_id')
      .equals(template.id)
      .toArray()
    const stored = templateLessons.find((row) => row.title === first.title)

    expect(stored).toBeDefined()
    expect(stored?.unit).toBe(first.unit)
    expect(stored?.lesson_in_unit).toBe(first.lesson_in_unit)
    expect(stored?.description).toBe(first.description)
  })

  it('survives soft-deletion of the source Subject', async () => {
    const { subject, first, second } = await makeSubjectWithLessons()
    const template = await saveSubjectTemplate(subject.id, 'Math Template')

    await deleteSubject(subject.id)

    const storedTemplate = await db.subject_template.get(template.id)
    const templateLessons = await db.subject_template_lesson
      .where('subject_template_id')
      .equals(template.id)
      .toArray()

    expect(storedTemplate).toBeDefined()
    expect(templateLessons).toHaveLength(2)
    expect(templateLessons.map((l) => l.title).sort()).toEqual([first.title, second.title].sort())
  })
})
