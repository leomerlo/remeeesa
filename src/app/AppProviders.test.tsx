import { QueryClient, useQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import type { AppFirebaseClient } from '@/lib/firebase'
import { useFirebase } from '@/lib/firebaseContext'
import { createFirebaseStub } from '@/test/firebaseStub'
import { AppProviders } from './AppProviders'

function Probe({
  expected,
}: {
  readonly expected: AppFirebaseClient
}): ReactElement {
  const client = useFirebase()
  const { data } = useQuery({
    queryKey: ['probe'],
    queryFn: () =>
      Promise.resolve(client === expected ? 'wired' : 'wrong client'),
  })

  return <span>{data ?? 'loading'}</span>
}

describe('AppProviders', () => {
  it('lets one child read the Firebase client and run a query', async () => {
    const client = createFirebaseStub()

    render(
      <AppProviders client={client} queryClient={new QueryClient()}>
        <Probe expected={client} />
      </AppProviders>,
    )

    expect(await screen.findByText('wired')).toBeInTheDocument()
  })
})
