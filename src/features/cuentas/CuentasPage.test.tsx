import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createFirebaseStub } from '@/test/firebaseStub'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { CuentasPage } from './CuentasPage'

function renderCuentasPage(
  ui: ReactElement,
  options?: Parameters<typeof renderWithProviders>[1],
) {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/cuentas']}>
      <Routes>
        <Route path="/" element={<p>Home</p>} />
        <Route path="/cuentas" element={ui} />
      </Routes>
    </MemoryRouter>,
    options,
  )
}

describe('CuentasPage', () => {
  it('shows a loading status while resolving the session user', () => {
    const client = createFirebaseStub({
      auth: {
        currentUser: null,
        authStateReady: () => new Promise(() => {}),
        onAuthStateChanged: () => () => {},
      },
    })

    renderCuentasPage(
      <CuentasPage householdsDb={createMemoryHouseholdsDb().asUser('user-1')} />,
      { client },
    )

    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')
  })

  it('shows a loading status before membership resolves', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderCuentasPage(<CuentasPage currentUserId="user-1" householdsDb={db} />)

    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Cuentas' }),
      ).toBeInTheDocument()
    })
  })

  it('redirects to home when the user is signed out', () => {
    renderCuentasPage(
      <CuentasPage
        currentUserId={null}
        householdsDb={createMemoryHouseholdsDb().asUser('user-1')}
      />,
    )

    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('redirects to home when the user has no household', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    renderCuentasPage(<CuentasPage currentUserId="user-1" householdsDb={db} />)

    expect(await screen.findByText('Home')).toBeInTheDocument()
  })

  it('redirects to home when the membership lookup fails', async () => {
    const base = createMemoryHouseholdsDb().asUser('user-1')
    const db: HouseholdsDb = {
      ...base,
      getMembership: async () => {
        throw new Error('network error')
      },
    }

    renderCuentasPage(<CuentasPage currentUserId="user-1" householdsDb={db} />)

    expect(await screen.findByText('Home')).toBeInTheDocument()
  })

  it('shows the pending cuentas list and the "Nueva cuenta" trigger for a signed-in member', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderCuentasPage(<CuentasPage currentUserId="user-1" householdsDb={db} />)

    expect(
      await screen.findByRole('heading', { name: 'Cuentas' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Nueva cuenta' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('No hay cuentas pendientes'),
    ).toBeInTheDocument()
  })

  it('opens the add-cuenta form when the "Nueva cuenta" trigger is clicked', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderCuentasPage(<CuentasPage currentUserId="user-1" householdsDb={db} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Nueva cuenta' }),
    )

    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument()
  })
})
