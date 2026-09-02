import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeAll, vi } from 'vitest'

// Testing Library's default 1s budget for waitFor/findBy is fine for a
// single file but too tight for the whole suite: several screens chain two
// awaited reads (membership, then the entity) before they render anything,
// and under full-suite parallelism those occasionally overrun 1s and fail
// intermittently -- always passing again in isolation and on re-run.
//
// Raised once here rather than per assertion: two separate tests had already
// been patched individually with their own timeout, which is whack-a-mole
// for a whole class of flake. This only extends how long a truthy condition
// is *allowed* to take; a genuinely broken assertion still fails, just a few
// seconds later.
configure({ asyncUtilTimeout: 5000 })

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.get(key) ?? null
    },
    key(index: number) {
      return [...store.keys()][index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
  }
}

const localStorageMock = createLocalStorageMock()

// jsdom has no ResizeObserver. Radix's Switch primitive (used by the Switch
// UI component) measures itself with one unconditionally on mount via
// @radix-ui/react-use-size, even though this project never reads that size
// -- without a stub, mounting any Switch throws "ResizeObserver is not
// defined" in every test environment, not just ones that exercise sizing.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeAll(() => {
  vi.stubGlobal('localStorage', localStorageMock)
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  cleanup()
  localStorageMock.clear()
})
