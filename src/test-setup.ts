import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

// vitest.config.ts doesn't set test.globals, so @testing-library/react's
// automatic afterEach(cleanup) (which relies on detecting a global
// afterEach) never registers -- do it explicitly instead, or DOM from one
// test leaks into the next.
afterEach(() => {
  cleanup()
})

// jsdom has no ResizeObserver. A global stub (rather than a per-test
// vi.stubGlobal/unstubAllGlobals pair) avoids a real race: a router
// redirect can remount a ResizeObserver-using component after a test's own
// afterEach has already unstubbed the global, throwing outside any test.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}
