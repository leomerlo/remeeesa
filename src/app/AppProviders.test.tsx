import { QueryClient, useQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import type { AppSupabaseClient } from '@/lib/supabase'
import { useSupabase } from '@/lib/supabaseContext'
import { createSupabaseStub } from '@/test/supabaseStub'
import { AppProviders } from './AppProviders'

function Probe({
  expected,
}: {
  readonly expected: AppSupabaseClient
}): ReactElement {
  const client = useSupabase()
  const { data } = useQuery({
    queryKey: ['probe'],
    queryFn: () =>
      Promise.resolve(client === expected ? 'wired' : 'wrong client'),
  })

  return <span>{data ?? 'loading'}</span>
}

describe('AppProviders', () => {
  it('lets one child read the Supabase client and run a query', async () => {
    const client = createSupabaseStub()

    render(
      <AppProviders client={client} queryClient={new QueryClient()}>
        <Probe expected={client} />
      </AppProviders>,
    )

    expect(await screen.findByText('wired')).toBeInTheDocument()
  })
})
