import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { createHouseholdWithMembership } from '@/lib/households'
import { createFirebaseStub } from '@/test/firebaseStub'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { EditHouseholdPage } from './EditHouseholdPage'

function renderEditPage(
  ui: ReactElement,
  options?: Parameters<typeof renderWithProviders>[1],
) {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/household']}>
      <Routes>
        <Route path="/" element={<p>Home</p>} />
        <Route path="/household" element={ui} />
      </Routes>
    </MemoryRouter>,
    options,
  )
}

function createLiveAuthStub(userId: string) {
  let emitAuth: ((user: { readonly uid: string } | null) => void) | undefined

  return {
    currentUser: { uid: userId },
    authStateReady: async () => {},
    onAuthStateChanged: (
      listener: (user: { readonly uid: string } | null) => void,
    ) => {
      emitAuth = listener
      listener({ uid: userId })
      return () => {}
    },
    signOut: async () => {
      emitAuth?.(null)
    },
  }
}

describe('EditHouseholdPage', () => {
  it('shows a loading status while resolving the session user', () => {
    const client = createFirebaseStub({
      auth: {
        currentUser: null,
        authStateReady: () => new Promise(() => {}),
        onAuthStateChanged: () => () => {},
      },
    })

    renderEditPage(
      <EditHouseholdPage
        householdsDb={createMemoryHouseholdsDb().asUser('user-1')}
      />,
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

    renderEditPage(
      <EditHouseholdPage currentUserId="user-1" householdsDb={db} />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')

    await waitFor(() => {
      expect(screen.getByLabelText('Nombre del hogar')).toHaveValue(
        'Casa Verde',
      )
    })
  })

  it('shows name, budget, participants, and invite controls', async () => {
    const store = createMemoryHouseholdsDb()
    const db = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    store.addMember({ userId: 'user-2', householdId: household.id })

    renderEditPage(
      <EditHouseholdPage currentUserId="user-1" householdsDb={db} />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Nombre del hogar')).toHaveValue(
        'Casa Verde',
      )
    })
    expect(screen.getByLabelText('Presupuesto mensual')).toHaveValue('100')
    expect(
      await screen.findByRole('heading', { name: 'Integrantes' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Vos')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Generar link de invitación' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ajustes' })).toBeInTheDocument()
  })

  it('saves a renamed household', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderEditPage(
      <EditHouseholdPage currentUserId="user-1" householdsDb={db} />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Nombre del hogar')).toHaveValue(
        'Casa Verde',
      )
      expect(screen.getByLabelText('Presupuesto mensual')).toHaveValue('100')
    })
    fireEvent.change(screen.getByLabelText('Nombre del hogar'), {
      target: { value: 'Casa Azul' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Nombre del hogar')).toHaveValue('Casa Azul')
    })
  })

  it('redirects to home when the user has no household', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    renderEditPage(
      <EditHouseholdPage currentUserId="user-1" householdsDb={db} />,
    )

    expect(await screen.findByText('Home')).toBeInTheDocument()
  })

  it('hides logout when currentUserId is passed as a prop', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderEditPage(
      <EditHouseholdPage currentUserId="user-1" householdsDb={db} />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Nombre del hogar')).toHaveValue(
        'Casa Verde',
      )
    })
    expect(
      screen.queryByRole('button', { name: 'Cerrar sesión' }),
    ).not.toBeInTheDocument()
  })

  it('shows logout and returns to login for returning users after signing out', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const client = createFirebaseStub({
      auth: createLiveAuthStub('user-1'),
    })

    renderEditPage(<EditHouseholdPage householdsDb={db} />, { client })

    await waitFor(() => {
      expect(screen.getByLabelText('Nombre del hogar')).toHaveValue(
        'Casa Verde',
      )
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(await screen.findByText('Home')).toBeInTheDocument()
  })
})
