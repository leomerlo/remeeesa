import { createContext, useContext, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { HouseholdDraft } from './householdDraft'

type HouseholdDraftContextValue = {
  readonly draft: HouseholdDraft | null
  readonly saveDraft: (draft: HouseholdDraft) => void
}

const HouseholdDraftContext = createContext<HouseholdDraftContextValue | null>(
  null,
)

type HouseholdDraftProviderProps = {
  readonly children: ReactNode
}

// Draft lives in React state only. Reloading or leaving the tree drops it;
// nothing here writes to localStorage, sessionStorage, or Firestore.
export function HouseholdDraftProvider({
  children,
}: HouseholdDraftProviderProps): ReactElement {
  const [draft, setDraft] = useState<HouseholdDraft | null>(null)

  return (
    <HouseholdDraftContext.Provider
      value={{
        draft,
        saveDraft: (next) => {
          setDraft(next)
        },
      }}
    >
      {children}
    </HouseholdDraftContext.Provider>
  )
}

export function useHouseholdDraft(): HouseholdDraftContextValue {
  const value = useContext(HouseholdDraftContext)

  if (value === null) {
    throw new Error(
      'useHouseholdDraft must be used inside HouseholdDraftProvider',
    )
  }

  return value
}
