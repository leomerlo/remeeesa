import { renderHook } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createSupabaseStub } from '@/test/supabaseStub'
import { SupabaseProvider, useSupabase } from './supabaseContext'

describe('useSupabase', () => {
  it('returns the client injected into SupabaseProvider', () => {
    const client = createSupabaseStub()
    const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
      <SupabaseProvider client={client}>{children}</SupabaseProvider>
    )

    const { result } = renderHook(() => useSupabase(), { wrapper })

    expect(result.current).toBe(client)
  })

  it('throws when used outside SupabaseProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      expect(() => renderHook(() => useSupabase())).toThrow(
        'useSupabase must be used inside SupabaseProvider',
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})
