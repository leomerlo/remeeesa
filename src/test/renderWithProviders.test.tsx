import { useQuery } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import type { AppFirebaseClient } from '@/lib/firebase'
import { useFirebase } from '@/lib/firebaseContext'
import { renderWithProviders } from './renderWithProviders'
import { createFirebaseStub } from './firebaseStub'

// Reaching useFirebase without throwing is itself the proof that a client was
// provided, so this probe only has to report that its query ran.
function QueryProbe({ label }: { readonly label: string }): ReactElement {
  useFirebase()
  const { data } = useQuery({
    queryKey: ['probe', label],
    queryFn: () => Promise.resolve(label),
  })

  return <span>{data ?? 'loading'}</span>
}

function IdentityProbe({
  expected,
}: {
  readonly expected: AppFirebaseClient
}): ReactElement {
  const client = useFirebase()

  return <span>{client === expected ? 'injected client' : 'other client'}</span>
}

describe('renderWithProviders', () => {
  it('supplies a stub client and a query client when given no options', async () => {
    renderWithProviders(<QueryProbe label="query ran" />)

    expect(await screen.findByText('query ran')).toBeInTheDocument()
  })

  it('passes the given client through to the tree', () => {
    const client = createFirebaseStub()

    renderWithProviders(<IdentityProbe expected={client} />, { client })

    expect(screen.getByText('injected client')).toBeInTheDocument()
  })
})
