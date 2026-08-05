import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pull, push } from './engine'
import { onLocalWrite } from '../db/writes'
import { initialSyncStatus, startSyncScheduler, type SyncScheduler } from './scheduler'

// Unlike engine.test.ts (which exercises push()/pull() for real against a
// stubbed fetch), this file mocks the two -- what's under test here is only
// *when* they're called and how failures affect status/backoff, at exactly
// the seam engine.ts's own comment names as #21's responsibility. Testing
// that through real timers/network/Dexie would mean re-proving engine.ts's
// own already-covered behavior on every case.
vi.mock('./engine', () => ({ push: vi.fn(), pull: vi.fn() }))
vi.mock('../db/writes', () => ({ onLocalWrite: vi.fn(() => vi.fn()) }))

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

function setVisibility(value: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value })
}

function registeredWriteHandler(): () => void {
  return vi.mocked(onLocalWrite).mock.calls[0]![0]
}

// A failed assertion mid-test must not leave a scheduler's window/document
// listeners attached for the next test to trip over -- track every instance
// this file starts and stop them all unconditionally.
let activeSchedulers: SyncScheduler[] = []
function start(): SyncScheduler {
  const scheduler = startSyncScheduler()
  activeSchedulers.push(scheduler)
  return scheduler
}

beforeEach(() => {
  vi.useFakeTimers()
  setOnline(true)
  setVisibility('visible')
  vi.mocked(push).mockReset().mockResolvedValue(undefined)
  vi.mocked(pull).mockReset().mockResolvedValue(undefined)
  vi.mocked(onLocalWrite).mockClear()
})

afterEach(() => {
  activeSchedulers.forEach((scheduler) => scheduler.stop())
  activeSchedulers = []
  vi.useRealTimers()
})

describe('initialSyncStatus', () => {
  it('reflects navigator.onLine, so a first paint never claims synced while offline', () => {
    setOnline(false)
    expect(initialSyncStatus()).toBe('not-connected')

    setOnline(true)
    expect(initialSyncStatus()).toBe('synced')
  })
})

describe('startSyncScheduler', () => {
  it('syncs immediately on startup and ends up synced', async () => {
    const scheduler = start()

    await vi.advanceTimersByTimeAsync(0)

    expect(push).toHaveBeenCalledTimes(1)
    expect(pull).toHaveBeenCalledTimes(1)
    expect(scheduler.getStatus()).toBe('synced')
  })

  it('reports not-connected without attempting a sync when already offline at startup', async () => {
    setOnline(false)

    const scheduler = start()
    await vi.advanceTimersByTimeAsync(0)

    expect(push).not.toHaveBeenCalled()
    expect(scheduler.getStatus()).toBe('not-connected')
  })

  it('notifies subscribers of status transitions', async () => {
    const scheduler = start()
    const seen: string[] = [scheduler.getStatus()]
    scheduler.subscribe((status) => seen.push(status))

    await vi.advanceTimersByTimeAsync(0)

    expect(seen).toEqual(['syncing', 'synced'])
  })

  it('debounces a burst of writes into a single sync after the last one settles', async () => {
    start()
    await vi.advanceTimersByTimeAsync(0)
    vi.mocked(push).mockClear()
    vi.mocked(pull).mockClear()

    const onWrite = registeredWriteHandler()
    onWrite()
    await vi.advanceTimersByTimeAsync(500)
    onWrite()
    await vi.advanceTimersByTimeAsync(500)
    onWrite()

    expect(push).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2_000)

    expect(push).toHaveBeenCalledTimes(1)
  })

  it('re-syncs immediately when the browser comes back online', async () => {
    setOnline(false)
    start()
    await vi.advanceTimersByTimeAsync(0)
    expect(push).not.toHaveBeenCalled()

    setOnline(true)
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)

    expect(push).toHaveBeenCalledTimes(1)
  })

  it('sets not-connected as soon as the browser goes offline', async () => {
    const scheduler = start()
    await vi.advanceTimersByTimeAsync(0)

    setOnline(false)
    window.dispatchEvent(new Event('offline'))

    expect(scheduler.getStatus()).toBe('not-connected')
  })

  it('re-syncs when the tab is foregrounded', async () => {
    start()
    await vi.advanceTimersByTimeAsync(0)
    vi.mocked(push).mockClear()
    vi.mocked(pull).mockClear()

    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    expect(push).toHaveBeenCalledTimes(1)
  })

  it('does not sync on a visibilitychange event while the tab is hidden', async () => {
    start()
    await vi.advanceTimersByTimeAsync(0)
    vi.mocked(push).mockClear()

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    expect(push).not.toHaveBeenCalled()
  })

  it('retries with backoff after a failed sync, then recovers once a retry succeeds', async () => {
    vi.mocked(push).mockRejectedValueOnce(new Error('network error'))
    const scheduler = start()

    await vi.advanceTimersByTimeAsync(0)
    expect(scheduler.getStatus()).toBe('not-connected')
    expect(push).toHaveBeenCalledTimes(1)

    // Not due yet: nothing retried before the base backoff delay elapses.
    await vi.advanceTimersByTimeAsync(1_000)
    expect(push).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(push).toHaveBeenCalledTimes(2)
    expect(scheduler.getStatus()).toBe('synced')
  })

  it('doubles the backoff delay on consecutive failures', async () => {
    vi.mocked(push).mockRejectedValue(new Error('network error'))
    start()

    await vi.advanceTimersByTimeAsync(0)
    expect(push).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(3_000)
    expect(push).toHaveBeenCalledTimes(2)

    // Second failure's retry shouldn't be due yet at the first delay's length.
    await vi.advanceTimersByTimeAsync(3_000)
    expect(push).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(3_000)
    expect(push).toHaveBeenCalledTimes(3)
  })

  it('ignores a write-hook event caused by applying its own pull/push result', async () => {
    start()
    await vi.advanceTimersByTimeAsync(0)
    vi.mocked(push).mockClear()
    vi.mocked(pull).mockClear()

    // Simulates engine.ts's applyRemoteBatch writing pulled rows into Dexie
    // mid-sync, which would otherwise re-fire onLocalWrite.
    vi.mocked(pull).mockImplementationOnce(async () => {
      registeredWriteHandler()()
    })
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(push).toHaveBeenCalledTimes(1)

    // If the write above had armed the debounce, this would fire a second,
    // spurious sync.
    await vi.advanceTimersByTimeAsync(5_000)

    expect(push).toHaveBeenCalledTimes(1)
  })

  it('stops all further activity once stopped', async () => {
    const scheduler = start()
    await vi.advanceTimersByTimeAsync(0)
    vi.mocked(push).mockClear()

    scheduler.stop()
    const onWrite = registeredWriteHandler()
    onWrite()
    await vi.advanceTimersByTimeAsync(10_000)
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(10_000)

    expect(push).not.toHaveBeenCalled()
  })
})
