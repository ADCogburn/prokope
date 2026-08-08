import { afterEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import { createClass, deleteClass, renameClass } from './classes'
import { createSubject, deleteSubject, renameSubject } from './subjects'
import { createLesson, deleteLesson, updateLessonContent } from './lessons'
import {
  saveClassTemplate,
  saveSubjectTemplate,
  listSubjectTemplatesForUser,
  applySubjectTemplate,
} from './templates'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('saveClassTemplate', () => {
  it('writes a class_template row with a client-side UUID, the class owner, and the given name', async () => {
    const klass = await createClass({ user_id: 'user-1', name: 'Room 5' })

    const template = await saveClassTemplate(klass.id, 'End of year snapshot')

    expect(template.id).toMatch(UUID_PATTERN)
    expect(template.user_id).toBe('user-1')
    expect(template.name).toBe('End of year snapshot')
    expect(await db.class_template.get(template.id)).toEqual(template)
  })

  it('captures every live subject (name, position) and every live lesson (unit, lesson_in_unit, title, description)', async () => {
    const klass = await createClass({ user_id: 'user-1', name: 'Room 5' })
    const math = await createSubject({ class_id: klass.id, name: 'Math', position: 0 })
    const ela = await createSubject({ class_id: klass.id, name: 'ELA', position: 1 })
    await createLesson({
      subject_id: math.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Counting',
      description: 'Count to 10',
    })
    await createLesson({
      subject_id: math.id,
      unit: 1,
      lesson_in_unit: 2,
      title: 'Addition',
      description: 'Add small numbers',
    })
    await createLesson({
      subject_id: ela.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Letters',
      description: 'Learn the alphabet',
    })

    const template = await saveClassTemplate(klass.id, 'Snapshot')

    const templateSubjects = await db.class_template_subject
      .where('class_template_id')
      .equals(template.id)
      .toArray()
    expect(templateSubjects).toHaveLength(2)
    const mathSubject = templateSubjects.find((row) => row.name === 'Math')!
    const elaSubject = templateSubjects.find((row) => row.name === 'ELA')!
    expect(mathSubject.position).toBe(0)
    expect(elaSubject.position).toBe(1)

    const mathLessons = await db.class_template_lesson
      .where('class_template_subject_id')
      .equals(mathSubject.id)
      .toArray()
    expect(mathLessons.map((row) => row.title).sort()).toEqual(['Addition', 'Counting'])
    const addition = mathLessons.find((row) => row.title === 'Addition')!
    expect(addition.unit).toBe(1)
    expect(addition.lesson_in_unit).toBe(2)
    expect(addition.description).toBe('Add small numbers')

    const elaLessons = await db.class_template_lesson
      .where('class_template_subject_id')
      .equals(elaSubject.id)
      .toArray()
    expect(elaLessons).toHaveLength(1)
    expect(elaLessons[0]!.title).toBe('Letters')
  })

  it('ignores a soft-deleted subject, and its lessons, entirely', async () => {
    const klass = await createClass({ user_id: 'user-1', name: 'Room 5' })
    const live = await createSubject({ class_id: klass.id, name: 'Math', position: 0 })
    const removed = await createSubject({ class_id: klass.id, name: 'Removed', position: 1 })
    await createLesson({
      subject_id: live.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Counting',
      description: 'Count to 10',
    })
    await createLesson({
      subject_id: removed.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Ghost',
      description: 'Should not appear',
    })
    await deleteSubject(removed.id)

    const template = await saveClassTemplate(klass.id, 'Snapshot')

    const templateSubjects = await db.class_template_subject
      .where('class_template_id')
      .equals(template.id)
      .toArray()
    expect(templateSubjects).toHaveLength(1)
    expect(templateSubjects[0]!.name).toBe('Math')
  })

  it('ignores a soft-deleted lesson within an otherwise-live subject', async () => {
    const klass = await createClass({ user_id: 'user-1', name: 'Room 5' })
    const subject = await createSubject({ class_id: klass.id, name: 'Math', position: 0 })
    await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Counting',
      description: 'Count to 10',
    })
    const removedLesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 2,
      title: 'Ghost',
      description: 'Should not appear',
    })
    await deleteLesson(removedLesson.id)

    const template = await saveClassTemplate(klass.id, 'Snapshot')

    const templateSubjects = await db.class_template_subject
      .where('class_template_id')
      .equals(template.id)
      .toArray()
    const templateLessons = await db.class_template_lesson
      .where('class_template_subject_id')
      .equals(templateSubjects[0]!.id)
      .toArray()
    expect(templateLessons).toHaveLength(1)
    expect(templateLessons[0]!.title).toBe('Counting')
  })

  it('is unaffected by later edits to or soft-deletion of its source class, subjects, and lessons', async () => {
    const klass = await createClass({ user_id: 'user-1', name: 'Room 5' })
    const subject = await createSubject({ class_id: klass.id, name: 'Math', position: 0 })
    const lesson = await createLesson({
      subject_id: subject.id,
      unit: 1,
      lesson_in_unit: 1,
      title: 'Counting',
      description: 'Count to 10',
    })

    const template = await saveClassTemplate(klass.id, 'Snapshot')
    const templateSubjectsBefore = await db.class_template_subject
      .where('class_template_id')
      .equals(template.id)
      .toArray()
    const templateLessonsBefore = await db.class_template_lesson
      .where('class_template_subject_id')
      .equals(templateSubjectsBefore[0]!.id)
      .toArray()

    // Mutate and then delete every layer of the source class after the
    // template snapshot was taken.
    await renameClass(klass.id, 'Renamed room')
    await renameSubject(subject.id, 'Renamed subject')
    await updateLessonContent(lesson.id, {
      unit: 9,
      lesson_in_unit: 9,
      title: 'Renamed lesson',
      description: 'Changed description',
    })
    await deleteLesson(lesson.id)
    await deleteSubject(subject.id)
    await deleteClass(klass.id)

    const templateAfter = await db.class_template.get(template.id)
    const templateSubjectsAfter = await db.class_template_subject
      .where('class_template_id')
      .equals(template.id)
      .toArray()
    const templateLessonsAfter = await db.class_template_lesson
      .where('class_template_subject_id')
      .equals(templateSubjectsBefore[0]!.id)
      .toArray()

    expect(templateAfter).toEqual(template)
    expect(templateSubjectsAfter).toEqual(templateSubjectsBefore)
    expect(templateLessonsAfter).toEqual(templateLessonsBefore)
    expect(templateSubjectsAfter[0]!.name).toBe('Math')
    expect(templateLessonsAfter[0]!.title).toBe('Counting')
    expect(templateLessonsAfter[0]!.unit).toBe(1)
    expect(templateLessonsAfter[0]!.lesson_in_unit).toBe(1)
  })

  it('throws when the class does not exist', async () => {
    await expect(saveClassTemplate('missing-class', 'Snapshot')).rejects.toThrow()
  })
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
