import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { HouseholdDraftProvider } from '@/features/onboarding'
import { createPendiente, listPendientes } from '@/lib/pendientes'
import { listCategories, listExpensesInMonth } from '@/lib/expenses'
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

    // The household's name is the app header's now, not this page's -- see
    // AppHeader.test.tsx. What says the household loaded here is its budget.
    expect(
      await screen.findByRole('status', {
        name: /presupuesto restante \$100/i,
      }),
    ).toHaveTextContent('$100')
    // The two cards read from the same month's expenses, from opposite
    // ends: Gastado counts up from zero, Presupuesto restante counts down
    // from the budget.
    expect(
      screen.getByRole('status', { name: 'Gastos de este mes $0' }),
    ).toHaveTextContent('$0')
    expect(
      await screen.findByText('Todavía no hay gastos este mes'),
    ).toBeInTheDocument()
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
    // otherwise be its own card repeating "Todavía no hay gastos este mes"
    // a second and third time, on top of the movements list's own (the one
    // legitimate instance, asserted above).
    expect(
      screen.queryByRole('heading', { name: 'Categorías' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryAllByText('Todavía no hay gastos este mes'),
    ).toHaveLength(1)
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

  it('creates a pending item from the unified Agregar gasto sheet when "Ya lo pagué" is unchecked', async () => {
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

    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Categoría')).toBeInTheDocument()
    expect(screen.getByLabelText('Recurrente')).toBeInTheDocument()
    // "Ya lo pagué" starts checked -- the common case is logging something
    // that already happened -- so the date/amount fields start in their
    // "already paid" shape.
    expect(screen.getByLabelText('Ya lo pagué')).toBeChecked()
    expect(screen.getByLabelText('Precio')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Alquiler' },
    })
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: 'Servicios' },
    })
    fireEvent.click(screen.getByLabelText('Ya lo pagué'))

    // Unchecking it swaps the field labels to the "not yet paid" shape.
    expect(screen.getByLabelText('Monto esperado')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha de vencimiento')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar pendiente' }))

    // Sheet closes and the trigger reappears -- no route change, no reload.
    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: 'Agregar gasto' }),
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

    // The household's name is the app header's now, not this page's -- see
    // AppHeader.test.tsx. What says the household loaded here is its budget.
    expect(
      await screen.findByRole('status', {
        name: /presupuesto restante \$100/i,
      }),
    ).toHaveTextContent('$100')
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
    ).toHaveTextContent('$100')
    expect(
      await screen.findByText('Todavía no hay gastos este mes'),
    ).toBeInTheDocument()

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
    ).toHaveTextContent('$90')
    await waitFor(() => {
      expect(
        screen.getByRole('progressbar', { name: '% usado' }),
      ).toHaveAttribute('aria-valuenow', '10')
    })
    expect(
      await screen.findByRole('list', { name: 'Gastos por categoría' }),
    ).toHaveTextContent('Comida')
  })

  it('attributes a submitted expense to the signed-in member with the generic fallback name, absent one of their own', async () => {
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

  // Regression: a submitted expense used to be attributed using the raw
  // Firebase Auth profile name, ignoring whatever name a member had chosen
  // for themselves in Ajustes -- silently reverting every new Expense back
  // to their Google account's name. Per direct feedback.
  it("attributes a submitted expense using the member's own chosen display name, not their Auth profile name", async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
      displayName: 'Jlors',
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
          authorDisplayName: 'Jlors',
          name: 'Pizza',
          price: 10,
        }),
      ])
    })
  })

  it('opens the edit sheet with "Ya lo pagué" pre-checked when a "Cuentas por pagar" card is tapped, and saving marks it paid', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    if (comida === undefined) {
      throw new Error('expected seeded Comida category')
    }
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Prosegur',
      dueDate: new Date(2026, 8, 5),
      expectedAmount: 15000,
    })

    renderHome(<HomePage currentUserId="user-1" householdsDb={db} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Marcar pagado Prosegur' }),
    )

    expect(await screen.findByLabelText('Monto esperado')).toHaveValue('15.000')
    expect(screen.getByLabelText('Ya lo pagué')).toHaveAttribute(
      'data-state',
      'checked',
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar y marcar pagado' }),
    )

    await waitFor(async () => {
      expect(await listPendientes({ db, householdId: household.id })).toEqual(
        [],
      )
    })
  })
})
