import { fireEvent, screen, within } from '@testing-library/react'
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
    // No per-person breakdown here any more -- per direct feedback, who
    // spent what is still recorded on every Expense, just not shown.
    expect(
      screen.queryByRole('heading', { name: 'Por persona' }),
    ).not.toBeInTheDocument()

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

  // Per direct feedback: an all-time breakdown is too much at once, and a
  // breakdown fixed to the current month wasn't enough either -- paging
  // needs to move "Por categoría"/"Por persona" to a different month.
  it('pages the breakdown to a previous month via the MonthPager', async () => {
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
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15)
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Alquiler pasado',
      price: 500,
      comments: '',
      expenseDate: lastMonth,
    })
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Super de este mes',
      price: 120,
      comments: '',
      expenseDate: now,
    })

    renderPage(<CategoriasPage currentUserId="user-1" householdsDb={db} />)

    // Scoped to the category list, not a bare findByText -- with a single
    // category in view, the header total and the row's own amount are
    // identical, so an unscoped query matches more than one element.
    const breakdownList = await screen.findByRole('list', {
      name: 'Gastos por categoría',
    })
    expect(within(breakdownList).getByText('$120,00')).toBeInTheDocument()
    expect(screen.queryByText('$500,00')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))

    expect(
      await within(breakdownList).findByText('$500,00'),
    ).toBeInTheDocument()
    expect(screen.queryByText('$120,00')).not.toBeInTheDocument()
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
