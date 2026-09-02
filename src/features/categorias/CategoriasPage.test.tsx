import { screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { createExpense, listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { CategoriasPage } from './CategoriasPage'

function renderPage(ui: ReactElement) {
  return renderWithProviders(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('CategoriasPage', () => {
  // Regression, same shape as HistoricoPage's: membership only resolves for a
  // signed-in user, so treating "no session" as "still loading" would hang
  // this screen on "Cargando…" forever.
  it('shows the empty state rather than hanging with no session', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    renderPage(<CategoriasPage currentUserId={null} householdsDb={db} />)

    expect(
      screen.getByRole('heading', { name: 'Categorías' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('Todavía no hay gastos este mes'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
  })

  it('shows this month breakdown for a member with expenses', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 1000,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    if (comida === undefined) {
      throw new Error('expected the seeded Comida category')
    }
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Super',
      price: 120,
      comments: '',
      expenseDate: new Date(),
    })

    renderPage(<CategoriasPage currentUserId="user-1" householdsDb={db} />)

    expect(
      screen.getByRole('heading', { name: 'Categorías' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Por categoría' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Por persona' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Ada')).toBeInTheDocument()

    // "Comida" appears twice on this screen -- once in the breakdown and once
    // in the management list below it -- so each is asserted in its own list.
    const breakdown = screen.getByRole('list', { name: 'Gastos por categoría' })
    expect(within(breakdown).getByText('Comida')).toBeInTheDocument()
    const manager = screen.getByRole('list', { name: 'Todas las categorías' })
    expect(within(manager).getByText('Comida')).toBeInTheDocument()

    // The month-over-month trend chart sits between the breakdown and the
    // management list.
    expect(
      await screen.findByRole('heading', { name: 'Por mes' }),
    ).toBeInTheDocument()
  })

  it('offers the management actions on the same screen, not a separate one', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 1000,
    })

    renderPage(<CategoriasPage currentUserId="user-1" householdsDb={db} />)

    expect(
      await screen.findByRole('heading', { name: 'Tus categorías' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Editar Comida' }),
    ).toBeInTheDocument()
  })
})
