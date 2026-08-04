import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// vitest.config.ts doesn't set test.globals, so @testing-library/react's
// automatic afterEach(cleanup) (which relies on detecting a global
// afterEach) never registers -- do it explicitly instead, or DOM from one
// test leaks into the next.
afterEach(() => {
  cleanup()
})
