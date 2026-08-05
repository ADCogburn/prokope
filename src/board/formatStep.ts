import type { ProgressRow } from '../db/schema'

export function formatStep(progress: ProgressRow | undefined): string {
  if (!progress || (progress.step_unit === 0 && progress.step_lesson_in_unit === 0)) {
    return 'Not started'
  }
  return `Lesson ${progress.step_unit}.${progress.step_lesson_in_unit}`
}
