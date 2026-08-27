import { renderHook } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createFirebaseStub } from '@/test/firebaseStub'
import { FirebaseProvider, useFirebase } from './firebaseContext'

describe('useFirebase', () => {
  it('returns the client injected into FirebaseProvider', () => {
    const client = createFirebaseStub()
    const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
      <FirebaseProvider client={client}>{children}</FirebaseProvider>
    )

    const { result } = renderHook(() => useFirebase(), { wrapper })

    expect(result.current).toBe(client)
  })

  it('throws when used outside FirebaseProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      expect(() => renderHook(() => useFirebase())).toThrow(
        'useFirebase must be used inside FirebaseProvider',
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})
