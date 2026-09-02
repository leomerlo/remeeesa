import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { HouseholdDraftProvider } from '@/features/onboarding'
import { listPendientes } from '@/lib/pendientes'
import { listExpensesInMonth } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { SignupAuth } from '@/features/onboarding/signupAuth'
import { HomePage } from './HomePage'

function signupAuthFor(userId: string): SignupAuth {
  return {
    signUpWithEmail: vi.fn(async () => ({ userId })),
    signUpWithGoogle: vi.fn(async () => ({ userId })),
    signInWithEmail: vi.fn(async () => ({ userId })),
    signInWithGoogle: vi.fn(async () => ({ userId })),
  }
}

function renderHome(
  ui: ReactElement,
  options?: Parameters<typeof renderWithProviders>[1],
) {
  return renderWithProviders(
    <MemoryRouter>
      <HouseholdDraftProvider>{ui}</HouseholdDraftProvider>
    </MemoryRouter>,
    options,
  )
}

function currentMonthRange(now = new Date()): {
  readonly monthStart: Date
  readonly monthEnd: Date
} {
  return {
    monthStart: new Date(now.getFullYear(), now.getMonth(), 1),
    monthEnd: new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    ),
  }
}

describe('HomePage', () => {
  it('shows onboarding when there is no session', () => {
    renderHome(<HomePage currentUserId={null} />)

    expect(screen.getByLabelText('Nombre del hogar')).toBeInTheDocument()
    expect(
      screen.queryByRole('status', { name: /presupuesto restante/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Agregar gasto' }),
    ).not.toBeInTheDocument()
  })

  it('shows onboarding when the signed-in user has no household', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    renderHome(<HomePage currentUserId="user-1" householdsDb={db} />)

    expect(await screen.findByLabelText('Nombre del hogar')).toBeInTheDocument()
    expect(
      screen.queryByRole('status', { name: /presupuesto restante/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Agregar gasto' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Cerrar sesión' }),
    ).not.toBeInTheDocument()
  })

  it('shows the household when the user already belongs', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderHome(<HomePage currentUserId="user-1" householdsDb={db} />)

    expect(await screen.findByText('Casa Verde')).toBeInTheDocument()
    expect(
      await screen.findByRole('status', {
        name: /presupuesto restante \$100/i,
      }),
    ).toHaveTextContent('$100,00')
    // The two cards read from the same month's expenses, from opposite
    // ends: Gastado counts up from zero, Presupuesto restante counts down
    // from the budget.
    expect(
      screen.getByRole('status', { name: 'Gastado este mes $0,00' }),
    ).toHaveTextContent('$0,00')
    expect(await screen.findByText('Todavía no hay gastos')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: '% usado' }),
    ).toHaveAttribute('aria-valuenow', '0')
    expect(screen.queryByLabelText('Nombre del hogar')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Generar link de invitación' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Agregar gasto' }),
    ).toBeInTheDocument()
    // Neither mini-summary renders anything on an empty month: each would
    // otherwise be its own card repeating "Todavía no hay gastos este mes",
    // on top of the movements list's own illustrated empty state above them.
    expect(
      screen.queryByRole('heading', { name: 'Categorías' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Integrantes' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryAllByText('Todavía no hay gastos este mes'),
    ).toHaveLength(0)
    expect(
      screen.getByRole('button', { name: 'Nuevo pendiente' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Por pagar')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Precio')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Categoría')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Fecha')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Cerrar sesión' }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar gasto' }))

    expect(await screen.findByLabelText('Precio')).toBeInTheDocument()
    expect(screen.getByLabelText('Categoría')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
    expect(screen.queryByLabelText(/author/i)).not.toBeInTheDocument()
  })

  it('opens the Nuevo pendiente sheet and creates a pending item', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderHome(<HomePage currentUserId="user-1" householdsDb={db} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Nuevo pendiente' }),
    )

    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Categoría')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha de vencimiento')).toBeInTheDocument()
    expect(screen.getByLabelText('Monto esperado')).toBeInTheDocument()
    expect(screen.getByLabelText('Recurrente')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Alquiler' },
    })
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: 'Servicios' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar pendiente' }))

    // Sheet closes and the trigger reappears -- no route change, no reload.
    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: 'Nuevo pendiente' }),
    ).toBeInTheDocument()

    const pending = await listPendientes({ db, householdId: household.id })
    expect(pending).toEqual([
      expect.objectContaining({
        name: 'Alquiler',
        expectedAmount: null,
        recurring: false,
        status: 'pending',
      }),
    ])
  })

  it('shows the household after signup creates it', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const signupAuth = signupAuthFor('user-1')

    renderHome(
      <HomePage
        currentUserId="user-1"
        householdsDb={db}
        signupAuth={signupAuth}
      />,
    )

    fireEvent.change(await screen.findByLabelText('Nombre del hogar'), {
      target: { value: 'Casa Verde' },
    })
    fireEvent.change(screen.getByLabelText('Presupuesto mensual'), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ada@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'secret12' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByText('Casa Verde')).toBeInTheDocument()
    expect(
      await screen.findByRole('status', {
        name: /presupuesto restante \$100/i,
      }),
    ).toHaveTextContent('$100,00')
    expect(
      screen.getByRole('button', { name: 'Agregar gasto' }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(signupAuth.signUpWithEmail).toHaveBeenCalled()
    })
  })

  it('attributes a submitted expense using the authorDisplayName prop', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderHome(
      <HomePage
        currentUserId="user-1"
        householdsDb={db}
        authorDisplayName="Ada"
      />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Agregar gasto' }),
    )
    fireEvent.change(await screen.findByLabelText('Nombre'), {
      target: { value: 'Pizza' },
    })
    fireEvent.change(screen.getByLabelText('Precio'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: 'Comida' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar gasto' }))

    await waitFor(async () => {
      const listed = await listExpensesInMonth({
        db,
        householdId: household.id,
        ...currentMonthRange(),
      })
      expect(listed).toEqual([
        expect.objectContaining({
          memberId: 'user-1',
          authorDisplayName: 'Ada',
          name: 'Pizza',
        }),
      ])
    })
  })

  it('closes the sheet and updates the list and remaining budget on screen after a successful add', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderHome(
      <HomePage
        currentUserId="user-1"
        householdsDb={db}
        authorDisplayName="Ada"
      />,
    )

    expect(
      await screen.findByRole('status', {
        name: /presupuesto restante \$100/i,
      }),
    ).toHaveTextContent('$100,00')
    expect(await screen.findByText('Todavía no hay gastos')).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Agregar gasto' }),
    )
    fireEvent.change(await screen.findByLabelText('Nombre'), {
      target: { value: 'Pizza' },
    })
    fireEvent.change(screen.getByLabelText('Precio'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: 'Comida' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar gasto' }))

    // Sheet closes and the trigger reappears, with no route change and no
    // full reload -- the list and remaining budget update in place.
    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: 'Agregar gasto' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Pizza')).toBeInTheDocument()
    expect(
      await screen.findByRole('status', { name: /presupuesto restante \$90/i }),
    ).toHaveTextContent('$90,00')
    await waitFor(() => {
      expect(
        screen.getByRole('progressbar', { name: '% usado' }),
      ).toHaveAttribute('aria-valuenow', '10')
    })
    expect(
      await screen.findByRole('list', { name: 'Gastos por categoría' }),
    ).toHaveTextContent('Comida')
    expect(
      await screen.findByRole('list', { name: 'Gastos por persona' }),
    ).toHaveTextContent('Ada')
  })

  it('attributes a submitted expense to the signed-in member with a Member display name', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderHome(<HomePage currentUserId="user-1" householdsDb={db} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Agregar gasto' }),
    )
    fireEvent.change(await screen.findByLabelText('Nombre'), {
      target: { value: 'Pizza' },
    })
    fireEvent.change(screen.getByLabelText('Precio'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: 'Comida' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar gasto' }))

    await waitFor(async () => {
      const listed = await listExpensesInMonth({
        db,
        householdId: household.id,
        ...currentMonthRange(),
      })
      expect(listed).toEqual([
        expect.objectContaining({
          memberId: 'user-1',
          authorDisplayName: 'Miembro',
          name: 'Pizza',
          price: 10,
        }),
      ])
    })
  })
})
