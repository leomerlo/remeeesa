import { act, renderHook } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  HouseholdDraftProvider,
  useHouseholdDraft,
} from './HouseholdDraftContext'

describe('useHouseholdDraft', () => {
  it('returns the draft state from HouseholdDraftProvider', () => {
    const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
      <HouseholdDraftProvider>{children}</HouseholdDraftProvider>
    )

    const { result } = renderHook(() => useHouseholdDraft(), { wrapper })

    expect(result.current.draft).toBeNull()
  })

  it('throws when used outside HouseholdDraftProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      expect(() => renderHook(() => useHouseholdDraft())).toThrow(
        'useHouseholdDraft must be used inside HouseholdDraftProvider',
      )
    } finally {
      consoleError.mockRestore()
    }
  })

  it('clears a saved draft', () => {
    const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
      <HouseholdDraftProvider>{children}</HouseholdDraftProvider>
    )

    const { result } = renderHook(() => useHouseholdDraft(), { wrapper })

    act(() => {
      result.current.saveDraft({ name: 'The Smiths', monthlyBudget: 1500 })
    })
    expect(result.current.draft).toEqual({
      name: 'The Smiths',
      monthlyBudget: 1500,
    })

    act(() => {
      result.current.clearDraft()
    })
    expect(result.current.draft).toBeNull()
  })
})
