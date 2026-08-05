import { db } from './schema'

const TABLES = [db.class, db.subject, db.lesson, db.student, db.progress]
const WRITE_HOOKS = ['creating', 'updating', 'deleting'] as const

/**
 * Fires `callback` on every local mutation across all entity tables, so
 * #21's sync scheduler can debounce a push without every CRUD module
 * (classes.ts, subjects.ts, ...) having to call it explicitly. Runs
 * synchronously inside Dexie's pre-commit hooks, so `callback` must not
 * touch the database itself -- it only schedules a later, independent sync
 * attempt (e.g. via setTimeout).
 */
export function onLocalWrite(callback: () => void): () => void {
  const handler = () => callback()

  for (const table of TABLES) {
    table.hook('creating', handler)
    table.hook('updating', handler)
    table.hook('deleting', handler)
  }

  return () => {
    for (const table of TABLES) {
      for (const hookName of WRITE_HOOKS) {
        table.hook(hookName).unsubscribe(handler)
      }
    }
  }
}
