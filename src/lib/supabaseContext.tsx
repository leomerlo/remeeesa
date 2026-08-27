import { createContext, useContext } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { AppSupabaseClient } from './supabase'

const SupabaseContext = createContext<AppSupabaseClient | null>(null)

type SupabaseProviderProps = {
  readonly client: AppSupabaseClient
  readonly children: ReactNode
}

export function SupabaseProvider({
  client,
  children,
}: SupabaseProviderProps): ReactElement {
  return (
    <SupabaseContext.Provider value={client}>
      {children}
    </SupabaseContext.Provider>
  )
}

export function useSupabase(): AppSupabaseClient {
  const client = useContext(SupabaseContext)

  if (client === null) {
    throw new Error('useSupabase must be used inside SupabaseProvider')
  }

  return client
}
