import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AppProviders } from '@/app/AppProviders'
import type { AppFirebaseClient } from '@/lib/firebase'
import { createFirebaseStub } from './firebaseStub'

type RenderWithProvidersOptions = {
  readonly client?: AppFirebaseClient
}

// Every feature test starts here, so no test ever writes a provider tree.
// retry is off so a failure case resolves immediately instead of burning
// through React Query's backoff.
export function renderWithProviders(
  ui: ReactNode,
  options: RenderWithProvidersOptions = {},
): RenderResult {
  const { client = createFirebaseStub() } = options
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <AppProviders client={client} queryClient={queryClient}>
      {ui}
    </AppProviders>,
  )
}
