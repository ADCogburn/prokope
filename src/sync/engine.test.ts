import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/schema'
import type { ClassRow, ProgressRow, ReviewFlagRow } from '../db'
import {
  getRawClass,
  getRawProgressByPair,
  getRawReviewFlagByPair,
  putRawClass,
  putRawProgress,
  putRawReviewFlag,
} from '../db/sync'
import { AUTH_TOKEN_STORAGE_KEY } from '../auth/token'
import { push, pull, resetLocalStore } from './engine'
import { getPushWatermark, getPullWatermark, setPullWatermark, setPushWatermark } from './watermarks'

function makeClass(overrides: Partial<ClassRow> = {}): ClassRow {
  return {
    id: 'class-1',
    user_id: 'user-1',
    name: 'Room 5',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

function makeProgress(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    id: 'progress-1',
    student_id: 'student-1',
    subject_id: 'subject-1',
    step_unit: 1,
    step_lesson_in_unit: 1,
    step_hlc: 'hlc-1',
    step_client_id: 'client-a',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeReviewFlag(overrides: Partial<ReviewFlagRow> = {}): ReviewFlagRow {
  return {
    id: 'review-flag-1',
    student_id: 'student-1',
    lesson_id: 'lesson-1',
    flagged: false,
    hlc: 'hlc-1',
    client_id: 'client-a',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function emptyBatch() {
  return {
    classes: [],
    subjects: [],
    lessons: [],
    students: [],
    progress: [],
    review_flags: [],
    subject_templates: [],
    subject_template_lessons: [],
    class_templates: [],
    class_template_subjects: [],
    class_template_lessons: [],
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('resetLocalStore', () => {
  it('clears every Dexie table and both watermarks', async () => {
    await putRawClass(makeClass())
    await putRawProgress(makeProgress())
    await putRawReviewFlag(makeReviewFlag())
    setPushWatermark('2024-03-01T00:00:00.000Z')
    setPullWatermark('2024-03-01T00:00:00.000Z')

    await resetLocalStore()

    expect(await db.class.count()).toBe(0)
    expect(await db.progress.count()).toBe(0)
    expect(await db.review_flag.count()).toBe(0)
    expect(getPushWatermark()).toBeNull()
    expect(getPullWatermark()).toBeNull()
  })

  it('leaves a subsequent push treating the (now-empty) store as having nothing dirty', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
    await putRawClass(makeClass({ user_id: 'old-user' }))

    await resetLocalStore()
    await push()

    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('push', () => {
  it('does not call fetch when signed out', async () => {
    await push()

    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not call fetch when there is nothing dirty', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')

    await push()

    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends dirty rows and advances the push watermark past what it sent', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
    const row = makeClass({ updated_at: '2024-03-01T00:00:00.000Z' })
    await putRawClass(row)
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ...emptyBatch(), classes: [row] }))

    await push()

    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('http://localhost:5083/sync/push')
    const sentBody = JSON.parse((init as RequestInit).body as string)
    expect(sentBody.classes).toEqual([row])
    expect(getPushWatermark()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('does not resend a row once the push watermark has advanced past it', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
    const row = makeClass({ updated_at: '2024-03-01T00:00:00.000Z' })
    await putRawClass(row)
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ...emptyBatch(), classes: [row] }))
    await push()

    await push()

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('applies the echoed post-merge values back into Dexie', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
    const sent = makeClass({ name: 'Room 5', updated_at: '2024-03-01T00:00:00.000Z' })
    await putRawClass(sent)
    const echoed = { ...sent, name: 'Renamed by server', updated_at: '2024-03-01T00:05:00.000Z' }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ...emptyBatch(), classes: [echoed] }))

    await push()

    expect(await getRawClass(sent.id)).toEqual(echoed)
  })

  it('reconciles a progress row onto the server-echoed canonical id when it differs from the id sent', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
    const sent = makeProgress({ id: 'device-b-id', updated_at: '2024-03-01T00:00:00.000Z' })
    await putRawProgress(sent)
    const canonical = { ...sent, id: 'device-a-id' }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ...emptyBatch(), progress: [canonical] }))

    await push()

    expect(await db.progress.get('device-b-id')).toBeUndefined()
    const reconciled = await getRawProgressByPair(sent.student_id, sent.subject_id)
    expect(reconciled?.id).toBe('device-a-id')
  })

  it('reconciles a review_flag row onto the server-echoed canonical id when it differs from the id sent (#152/ADR-0011)', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
    const sent = makeReviewFlag({ id: 'device-b-id', updated_at: '2024-03-01T00:00:00.000Z' })
    await putRawReviewFlag(sent)
    const canonical = { ...sent, id: 'device-a-id' }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ...emptyBatch(), review_flags: [canonical] }))

    await push()

    expect(await db.review_flag.get('device-b-id')).toBeUndefined()
    const reconciled = await getRawReviewFlagByPair(sent.student_id, sent.lesson_id)
    expect(reconciled?.id).toBe('device-a-id')
  })
})

describe('pull', () => {
  it('does not call fetch when signed out', async () => {
    await pull()

    expect(fetch).not.toHaveBeenCalled()
  })

  it('omits the since param on a first pull and stores the watermark from the response', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ ...emptyBatch(), watermark: '2024-05-01T00:00:00.000Z' }),
    )

    await pull()

    const [url] = vi.mocked(fetch).mock.calls[0]!
    expect((url as URL).searchParams.has('since')).toBe(false)
    expect(getPullWatermark()).toBe('2024-05-01T00:00:00.000Z')
  })

  it('passes the stored pull watermark as since on a later pull', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
    setPullWatermark('2024-02-01T00:00:00.000Z')
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ ...emptyBatch(), watermark: '2024-02-01T00:00:00.000Z' }),
    )

    await pull()

    const [url] = vi.mocked(fetch).mock.calls[0]!
    expect((url as URL).searchParams.get('since')).toBe('2024-02-01T00:00:00.000Z')
  })

  it('writes incoming rows into Dexie', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
    const incoming = makeClass()
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ ...emptyBatch(), classes: [incoming], watermark: '2024-05-01T00:00:00.000Z' }),
    )

    await pull()

    expect(await getRawClass(incoming.id)).toEqual(incoming)
  })

  it('overwrites a local row with an incoming one unconditionally -- no conflict resolution for this table, per #6/#7', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
    const local = makeClass({ name: 'Local edit', updated_at: '2024-06-01T00:00:00.000Z' })
    await putRawClass(local)
    const incoming = { ...local, name: 'Incoming value', updated_at: '2024-01-01T00:00:00.000Z' }
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ ...emptyBatch(), classes: [incoming], watermark: '2024-05-01T00:00:00.000Z' }),
    )

    await pull()

    expect((await getRawClass(local.id))?.name).toBe('Incoming value')
  })

  it('merges an incoming progress row per-field rather than overwriting local edits', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
    const local = makeProgress({ step_hlc: 'hlc-9', step_unit: 42 })
    await putRawProgress(local)
    const incoming = makeProgress({
      id: 'other-device-id',
      step_hlc: 'hlc-1',
      step_unit: 1,
    })
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ ...emptyBatch(), progress: [incoming], watermark: '2024-05-01T00:00:00.000Z' }),
    )

    await pull()

    const merged = await getRawProgressByPair(local.student_id, local.subject_id)
    expect(merged?.step_unit).toBe(42)
    expect(merged?.step_hlc).toBe('hlc-9')
  })

  // #152/ADR-0011: review_flag gets the same per-field HLC merge treatment
  // as progress.step, just against its own (student_id, lesson_id) pair.
  describe('review_flag merge (#152/ADR-0011)', () => {
    it('same-side-wins: keeps the local flagged/hlc when the incoming hlc sorts earlier', async () => {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
      const local = makeReviewFlag({ flagged: true, hlc: 'hlc-9' })
      await putRawReviewFlag(local)
      const incoming = makeReviewFlag({ id: 'other-device-id', flagged: false, hlc: 'hlc-1' })
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ ...emptyBatch(), review_flags: [incoming], watermark: '2024-05-01T00:00:00.000Z' }),
      )

      await pull()

      const merged = await getRawReviewFlagByPair(local.student_id, local.lesson_id)
      expect(merged?.flagged).toBe(true)
      expect(merged?.hlc).toBe('hlc-9')
    })

    it('other-side-wins: takes the incoming flagged/hlc rather than overwriting local edits blindly', async () => {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
      const local = makeReviewFlag({ flagged: false, hlc: 'hlc-1' })
      await putRawReviewFlag(local)
      const incoming = makeReviewFlag({ id: 'other-device-id', flagged: true, hlc: 'hlc-9' })
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ ...emptyBatch(), review_flags: [incoming], watermark: '2024-05-01T00:00:00.000Z' }),
      )

      await pull()

      const merged = await getRawReviewFlagByPair(local.student_id, local.lesson_id)
      expect(merged?.flagged).toBe(true)
      expect(merged?.hlc).toBe('hlc-9')
    })

    it('tie-breaks an exactly-equal hlc by client_id', async () => {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'a-token')
      const local = makeReviewFlag({ flagged: false, hlc: 'hlc-1', client_id: 'aaaa' })
      await putRawReviewFlag(local)
      const incoming = makeReviewFlag({ id: 'other-device-id', flagged: true, hlc: 'hlc-1', client_id: 'zzzz' })
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ ...emptyBatch(), review_flags: [incoming], watermark: '2024-05-01T00:00:00.000Z' }),
      )

      await pull()

      const merged = await getRawReviewFlagByPair(local.student_id, local.lesson_id)
      expect(merged?.flagged).toBe(true)
      expect(merged?.client_id).toBe('zzzz')
    })
  })
})
