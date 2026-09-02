import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { createExpense, listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { HistoricoPage } from './HistoricoPage'

function renderPage(ui: ReactElement) {
  return renderWithProviders(<MemoryRouter>{ui}</MemoryRouter>)
}

async function seedHousehold() {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 100,
  })
  const categories = await listCategories({ db, householdId: household.id })
  const category = categories[0]
  if (category === undefined) {
    throw new Error('expected a seeded category')
  }
  return { db, householdId: household.id, categoryId: category.id }
}

async function seed(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
  readonly name: string
  readonly date: Date
  readonly price?: number
}) {
  return createExpense({
    db: input.db,
    householdId: input.householdId,
    categoryId: input.categoryId,
    memberId: 'user-1',
    authorDisplayName: 'Ada',
    name: input.name,
    price: input.price ?? 10,
    comments: '',
    expenseDate: input.date,
  })
}

describe('HistoricoPage', () => {
  // Regression: membership only ever resolves for a signed-in user, so
  // treating "no session" and "membership still loading" as the same case
  // left this screen stuck on "Cargando…" forever for a signed-out visitor.
  it('shows the empty state rather than hanging on "Cargando…" with no session', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    renderPage(<HistoricoPage currentUserId={null} householdsDb={db} />)

    expect(await screen.findByText('Todavía no hay gastos')).toBeInTheDocument()
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
  })

  it('shows an empty state for a household with no expenses', async () => {
    const { db } = await seedHousehold()

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    expect(
      screen.getByRole('heading', { name: 'Histórico' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Todavía no hay gastos')).toBeInTheDocument()
  })

  it('groups expenses under month headers, newest month first', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Alquiler agosto',
      date: new Date(2026, 7, 3),
      price: 300,
    })
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Cafe agosto',
      date: new Date(2026, 7, 20),
      price: 4.7,
    })

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    const august = await screen.findByRole('list', { name: 'Agosto de 2026' })
    const rows = within(august).getAllByRole('listitem')
    // Newest-first within the month.
    expect(rows[0]).toHaveTextContent('Cafe agosto')
    expect(rows[0]).toHaveTextContent('$4,70')
    expect(rows[1]).toHaveTextContent('Alquiler agosto')
    expect(rows[1]).toHaveTextContent('$300,00')
  })

  it('loads one further month at a time and stops offering more at the end', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seed({
      db,
      householdId,
      categoryId,
      name: 'De agosto',
      date: new Date(2026, 7, 3),
    })
    await seed({
      db,
      householdId,
      categoryId,
      name: 'De julio',
      date: new Date(2026, 6, 9),
    })

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    // Only August at first -- July is behind "Cargar más".
    expect(await screen.findByText('De agosto')).toBeInTheDocument()
    expect(screen.queryByText('De julio')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }))

    expect(await screen.findByText('De julio')).toBeInTheDocument()
    // Both months are now on screen, each under its own header, rendered once.
    expect(
      screen.getByRole('list', { name: 'Agosto de 2026' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('list', { name: 'Julio de 2026' }),
    ).toBeInTheDocument()
    // Nothing older left, so the button is gone rather than returning empty.
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Cargar más' }),
      ).not.toBeInTheDocument()
    })
  })

  it('opens the shared edit sheet for an expense from a past month', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Gasto viejo',
      date: new Date(2026, 2, 15),
      price: 55,
    })

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Gasto viejo' }),
    )

    // Pre-filled from the past-month expense -- the current-month
    // restriction that used to block this is gone.
    expect(await screen.findByLabelText('Nombre')).toHaveValue('Gasto viejo')
    expect(screen.getByLabelText('Precio')).toHaveValue('55')
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeInTheDocument()
  })

  it('saves an edit to a past-month expense and reflects it in the feed', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Gasto viejo',
      date: new Date(2026, 2, 15),
    })

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Gasto viejo' }),
    )
    fireEvent.change(await screen.findByLabelText('Nombre'), {
      target: { value: 'Gasto corregido' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Gasto corregido')).toBeInTheDocument()
    expect(screen.queryByText('Gasto viejo')).not.toBeInTheDocument()
  })

  // Histórico has no "add" entry point of its own -- it reuses the expense
  // sheet purely to edit a row it was handed. The sheet rendered its trigger
  // regardless, leaving an "Agregar gasto" button floating under the page
  // title with nothing around it.
  it('does not offer an add-expense button', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Gasto',
      date: new Date(),
    })

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    await screen.findByText('Gasto')
    expect(
      screen.queryByRole('button', { name: 'Agregar gasto' }),
    ).not.toBeInTheDocument()
  })

  // A history that only lists rows makes "what did we spend that month" a
  // manual sum.
  it('totals each month in its header', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    const now = new Date()
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Uno',
      date: now,
      price: 75,
    })
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Dos',
      date: now,
      price: 25,
    })

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    await screen.findByText('Uno')
    const monthHeading = screen.getAllByRole('heading', { level: 2 })[0]
    expect(monthHeading?.parentElement).toHaveTextContent('$100,00')
  })
})
