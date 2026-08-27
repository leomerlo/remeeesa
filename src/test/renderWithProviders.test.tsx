import { useQuery } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import type { AppSupabaseClient } from '@/lib/supabase'
import { useSupabase } from '@/lib/supabaseContext'
import { renderWithProviders } from './renderWithProviders'
import { createSupabaseStub } from './supabaseStub'

// Reaching useSupabase without throwing is itself the proof that a client was
// provided, so this probe only has to report that its query ran.
function QueryProbe({ label }: { readonly label: string }): ReactElement {
  useSupabase()
  const { data } = useQuery({
    queryKey: ['probe', label],
    queryFn: () => Promise.resolve(label),
  })

  return <span>{data ?? 'loading'}</span>
}

function IdentityProbe({
  expected,
}: {
  readonly expected: AppSupabaseClient
}): ReactElement {
  const client = useSupabase()

  return <span>{client === expected ? 'injected client' : 'other client'}</span>
}

describe('renderWithProviders', () => {
  it('supplies a stub client and a query client when given no options', async () => {
    renderWithProviders(<QueryProbe label="query ran" />)

    expect(await screen.findByText('query ran')).toBeInTheDocument()
  })

  it('passes the given client through to the tree', () => {
    const client = createSupabaseStub()

    renderWithProviders(<IdentityProbe expected={client} />, { client })

    expect(screen.getByText('injected client')).toBeInTheDocument()
  })
})
