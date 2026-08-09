import { AUTH_TOKEN_STORAGE_KEY } from '../auth/token'
import { API_URL } from '../config'

export interface GeneratedLesson {
  unit: number
  lesson_in_unit: number
  title: string
  description: string
}

export type GenerateAiCurriculumResult =
  | { status: 'found'; lessons: GeneratedLesson[] }
  | { status: 'not-found'; message: string }

/**
 * #217: the network seam for AI Bulk Generation's `POST /ai-bulk-generation`.
 * Same plain-async-function style as src/sync/api.ts, but reads the auth
 * token itself (rather than taking it as a parameter) since this has a
 * single caller and no batching/retry layer sits between them the way
 * sync/engine.ts sits between it and sync/api.ts.
 *
 * `found` and `not-found` are both normal return values -- distinguishing
 * "no such curriculum" from a real failure is the whole point of this
 * endpoint (#192) -- while any other non-2xx status, or an aborted signal,
 * rejects, since neither has a well-defined confirm-screen shape to return.
 */
export async function generateAiCurriculum(
  curriculumName: string,
  signal?: AbortSignal,
): Promise<GenerateAiCurriculumResult> {
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  const response = await fetch(`${API_URL}/ai-bulk-generation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ curriculum_name: curriculumName }),
    signal,
  })

  if (response.status === 200) {
    const body = (await response.json()) as { lessons: GeneratedLesson[] }
    return { status: 'found', lessons: body.lessons }
  }

  if (response.status === 404) {
    const body = (await response.json()) as { message: string }
    return { status: 'not-found', message: body.message }
  }

  throw new Error(`AI curriculum generation failed with status ${response.status}`)
}
