import { fireEvent, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExpense, findOrCreateCategory } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createPendiente } from '@/lib/pendientes'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { OnboardingChecklist } from './OnboardingChecklist'
import { hasFinishedOnboarding } from './onboardingStorage'

type Seed = {
  readonly withServicio?: boolean
  readonly withGasto?: boolean
}

async function renderChecklist(seed: Seed = {}) {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 900000,
  })
  const category = await findOrCreateCategory({
    db,
    householdId: household.id,
    name: 'Servicios',
  })
  if (seed.withServicio === true) {
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: category.id,
      name: 'Internet',
      dueDate: new Date(),
      expectedAmount: 42000,
      recurring: true,
    })
  }
  if (seed.withGasto === true) {
    await createExpense({
      db,
      householdId: household.id,
      categoryId: category.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Café',
      price: 2500,
      comments: '',
      expenseDate: new Date(),
    })
  }
  const onAddGasto = vi.fn()
  renderWithProviders(
    <MemoryRouter>
      <OnboardingChecklist
        db={db}
        householdId={household.id}
        onAddGasto={onAddGasto}
      />
    </MemoryRouter>,
  )
  return { onAddGasto }
}

describe('OnboardingChecklist', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('leads with the budget, which is what the app counts down from', async () => {
    await renderChecklist()

    expect(
      await screen.findByRole('heading', { name: 'Empezá por acá' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/arranca de un presupuesto/i)).toBeInTheDocument()
    expect(
      screen.getByText('Definí el presupuesto del mes'),
    ).toBeInTheDocument()
    // Already set during signup, so it shows the figure rather than an action.
    expect(screen.getByText(/\$900\.000 por mes/)).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Poner presupuesto' }),
    ).not.toBeInTheDocument()
  })

  it('offers the two things still missing', async () => {
    await renderChecklist()

    expect(
      await screen.findByRole('link', { name: 'Ir a Servicios' }),
    ).toHaveAttribute('href', '/pendientes')
    expect(
      screen.getByRole('button', { name: 'Cargar el primero' }),
    ).toBeInTheDocument()
  })

  it('asks Home to open the add sheet rather than mounting its own', async () => {
    const { onAddGasto } = await renderChecklist()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cargar el primero' }),
    )

    expect(onAddGasto).toHaveBeenCalledTimes(1)
  })

  it('ticks a step off once the thing is actually there', async () => {
    await renderChecklist({ withServicio: true })

    expect(
      await screen.findByText('Cargá los servicios que se repiten'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Ir a Servicios' }),
    ).not.toBeInTheDocument()
    // The gasto step is still open, so the card stays.
    expect(
      screen.getByRole('button', { name: 'Cargar el primero' }),
    ).toBeInTheDocument()
  })

  it('points at the invitation, which otherwise only lives in Ajustes', async () => {
    await renderChecklist()

    expect(
      await screen.findByRole('link', {
        name: 'Compartí el link de invitación',
      }),
    ).toHaveAttribute('href', '/household')
  })

  it('disappears for good once every step is done', async () => {
    await renderChecklist({ withServicio: true, withGasto: true })

    await waitFor(() => {
      expect(hasFinishedOnboarding()).toBe(true)
    })
    expect(
      screen.queryByRole('heading', { name: 'Empezá por acá' }),
    ).not.toBeInTheDocument()
  })

  it('renders nothing at all once the flag is stored, without asking the database', async () => {
    localStorage.setItem('remeeesa.onboarding_finished', '1')

    await renderChecklist()

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(
      screen.queryByRole('heading', { name: 'Empezá por acá' }),
    ).not.toBeInTheDocument()
  })
})
