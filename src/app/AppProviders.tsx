import { QueryClientProvider } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { ReactElement, ReactNode } from 'react'
import { SupabaseProvider } from '@/lib/supabaseContext'
import type { AppSupabaseClient } from '@/lib/supabase'

type AppProvidersProps = {
  readonly client: AppSupabaseClient
  readonly queryClient: QueryClient
  readonly children: ReactNode
}

// Both dependencies arrive as props, so this component builds nothing and reads
// no environment. main.tsx and renderWithProviders both compose through here,
// which keeps the nesting order in one place.
//
// Supabase sits outside React Query so the auth story can add an AuthProvider
// in the innermost slot, where it can read the client to subscribe to
// onAuthStateChange and the query client to clear the cache on sign out.
export function AppProviders({
  client,
  queryClient,
  children,
}: AppProvidersProps): ReactElement {
  return (
    <SupabaseProvider client={client}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SupabaseProvider>
  )
}
