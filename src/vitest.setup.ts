import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, vi } from 'vitest'

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
