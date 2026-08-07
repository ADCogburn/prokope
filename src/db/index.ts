export type {
  ClassRow,
  SubjectRow,
  LessonRow,
  StudentRow,
  ProgressRow,
  ClassTemplateRow,
  ClassTemplateSubjectRow,
  ClassTemplateLessonRow,
} from './schema'

export { createClass, getClass, getClassForUser, deleteClass, renameClass } from './classes'
export type { CreateClassInput } from './classes'

export { createSubject, listSubjectsForClass, reorderSubjects, deleteSubject, renameSubject } from './subjects'
export type { CreateSubjectInput } from './subjects'

export {
  createLesson,
  listLessonsForSubject,
  listLessonsForSubjects,
  getLessonByPosition,
  getNextLessonInSubject,
  getPreviousLessonInSubject,
  findNextLesson,
  findPreviousLesson,
  getNextLessonPosition,
  getSuggestedNewLessonPosition,
  deleteLesson,
  updateLessonContent,
  formatLessonLabel,
} from './lessons'
export type { CreateLessonInput, LessonPosition, UpdateLessonContentInput } from './lessons'

export {
  createStudent,
  getStudent,
  listStudentsForClass,
  reorderStudents,
  deleteStudent,
  renameStudent,
} from './students'
export type { CreateStudentInput } from './students'

export {
  getProgress,
  upsertProgressStep,
  upsertProgressReview,
  listProgressForStudents,
  advanceProgress,
  unAdvanceProgress,
  bulkAdvanceProgress,
  jumpToLesson,
  positionOf,
} from './progress'
export type { ProgressStep, BulkAdvanceEntry } from './progress'

export { saveClassTemplate } from './templates'

export { getClientId } from './clientId'
