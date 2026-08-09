import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_TOKEN_STORAGE_KEY } from '../auth/token'
import { generateAiCurriculum } from './aiBulkGeneration'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('generateAiCurriculum', () => {
  it('POSTs { curriculum_name } to /ai-bulk-generation with a bearer token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ lessons: [] }))

    await generateAiCurriculum('Algebra 1')

    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('http://localhost:5083/ai-bulk-generation')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer a-token' })
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ curriculum_name: 'Algebra 1' })
  })

  it('maps a 200 response to a found result with the lesson list', async () => {
    const lessons = [{ unit: 1, lesson_in_unit: 1, title: 'Intro', description: 'Overview' }]
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ lessons }))

    const result = await generateAiCurriculum('Algebra 1')

    expect(result).toEqual({ status: 'found', lessons })
  })

  it('maps a 404 response to a not-found result, as a normal return value rather than a thrown error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ curriculum_name: 'Nonexistent', message: "Couldn't find it." }, 404),
    )

    const result = await generateAiCurriculum('Nonexistent')

    expect(result).toEqual({ status: 'not-found', message: "Couldn't find it." })
  })

  it('rejects on any other non-2xx status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: 'boom' }, 502))

    await expect(generateAiCurriculum('Algebra 1')).rejects.toThrow()
  })

  it('rejects when the request is aborted', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'))

    await expect(generateAiCurriculum('Algebra 1', new AbortController().signal)).rejects.toThrow()
  })
})
