import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import {
  createExpense,
  EXPENSE_HISTORY_PAGE_SIZE,
  formatCurrency,
  listCategories,
} from '@/lib/expenses'
import {
  createHouseholdWithMembership,
  updateMemberDisplayName,
} from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createPendiente, markPendientePaid } from '@/lib/pendientes'
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

  it('loads a fixed page of expenses at a time, regardless of month, and stops offering more at the end', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    // EXPENSE_HISTORY_PAGE_SIZE in August (newest), plus 3 more in July --
    // the page boundary lands mid-history, not at the month line.
    for (let day = 1; day <= EXPENSE_HISTORY_PAGE_SIZE; day += 1) {
      await seed({
        db,
        householdId,
        categoryId,
        name: `Ago ${String(day)}`,
        date: new Date(2026, 7, day),
      })
    }
    for (let day = 1; day <= 3; day += 1) {
      await seed({
        db,
        householdId,
        categoryId,
        name: `Jul ${String(day)}`,
        date: new Date(2026, 6, day),
      })
    }

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    // Only the first page (all of August, the newest EXPENSE_HISTORY_PAGE_SIZE
    // rows) at first -- July is behind "Cargar más".
    expect(
      await screen.findByText(`Ago ${String(EXPENSE_HISTORY_PAGE_SIZE)}`),
    ).toBeInTheDocument()
    expect(screen.getByText('Ago 1')).toBeInTheDocument()
    expect(screen.queryByText('Jul 1')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }))

    expect(await screen.findByText('Jul 1')).toBeInTheDocument()
    // Both months are now on screen, each under its own header, rendered
    // once even though July only fully arrived on the second page.
    expect(
      screen.getByRole('list', { name: 'Agosto de 2026' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('list', { name: 'Julio de 2026' }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('list', { name: 'Julio de 2026' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(3)
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

  // A page can now land mid-month (see the pagination test above), so the
  // last month on screen might not be fully loaded yet -- showing its
  // running total as if it were final would undercount it.
  it('hides the last month\'s total while more of that month may still be behind "Cargar más"', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    for (let day = 1; day <= EXPENSE_HISTORY_PAGE_SIZE + 3; day += 1) {
      await seed({
        db,
        householdId,
        categoryId,
        name: `Ago ${String(day)}`,
        date: new Date(2026, 7, day),
      })
    }

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    await screen.findByText(`Ago ${String(EXPENSE_HISTORY_PAGE_SIZE)}`)
    const monthHeading = screen.getByRole('heading', {
      name: 'Agosto de 2026',
    })
    // No total shown yet -- only 15 of the 18 August expenses have loaded.
    expect(monthHeading.parentElement).toHaveTextContent('Agosto de 2026')
    expect(monthHeading.parentElement?.querySelector('span')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }))

    // Now the whole month has loaded (nothing older exists), so the total
    // appears, and is the full month's sum.
    await screen.findByText(`Ago ${String(EXPENSE_HISTORY_PAGE_SIZE + 3)}`)
    expect(monthHeading.parentElement).toHaveTextContent(
      formatCurrency(10 * (EXPENSE_HISTORY_PAGE_SIZE + 3)),
    )
  })

  // Regression: authorDisplayName is a snapshot taken when the expense was
  // created, so it used to go stale the moment a member corrected their name
  // in Ajustes -- old rows in Histórico kept showing the name they'd since
  // changed away from.
  it("shows the member's current display name, not the stale one stored on a past expense", async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
      displayName: 'Florencia Sepúlveda',
    })
    const categories = await listCategories({ db, householdId: household.id })
    const category = categories[0]
    if (category === undefined) {
      throw new Error('expected a seeded category')
    }
    await seed({
      db,
      householdId: household.id,
      categoryId: category.id,
      name: 'Veterinario',
      date: new Date(2026, 2, 15),
    })

    await updateMemberDisplayName({
      db,
      householdId: household.id,
      userId: 'user-1',
      displayName: 'Jlors',
    })

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    const row = await screen.findByRole('button', {
      name: 'Editar Veterinario',
    })
    expect(row).toHaveTextContent('Jlors')
    expect(row).not.toHaveTextContent('Florencia Sepúlveda')
  })

  // Regression: an Expense created by paying a Pendiente used to be
  // indistinguishable from a plain Gasto logged directly -- both were just
  // rows in Histórico with no way to tell which was which.
  it('marks an expense created by paying a pendiente as "Servicio", and a plain expense not at all', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Super',
      date: new Date(2026, 7, 5),
    })
    const pendiente = await createPendiente({
      db,
      householdId,
      categoryId,
      name: 'Internet',
      dueDate: new Date(2026, 7, 10),
      expectedAmount: 5000,
    })
    await markPendientePaid({
      db,
      householdId,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 5000,
      paymentDate: new Date(2026, 7, 10),
    })

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    const gastoRow = (
      await screen.findByRole('button', { name: 'Editar Super' })
    ).closest('li')
    const servicioRow = screen
      .getByRole('button', { name: 'Editar Internet' })
      .closest('li')
    expect(gastoRow).not.toBeNull()
    expect(servicioRow).not.toBeNull()
    expect(gastoRow).not.toHaveTextContent('Servicio')
    expect(servicioRow).toHaveTextContent('Servicio')
  })

  // Per direct feedback: no way to separate what the household pays as a
  // recurring bill from a one-off, in-the-moment purchase.
  it('filters between Servicios and Gastos, updating the month total to match', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Super',
      date: new Date(2026, 7, 5),
      price: 100,
    })
    const pendiente = await createPendiente({
      db,
      householdId,
      categoryId,
      name: 'Internet',
      dueDate: new Date(2026, 7, 10),
      expectedAmount: 5000,
    })
    await markPendientePaid({
      db,
      householdId,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 5000,
      paymentDate: new Date(2026, 7, 10),
    })

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    await screen.findByText('Super')
    expect(screen.getByText('Internet')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Agosto de 2026' }).parentElement,
    ).toHaveTextContent(formatCurrency(5100))

    fireEvent.click(screen.getByRole('tab', { name: 'Servicios' }))
    expect(screen.queryByText('Super')).not.toBeInTheDocument()
    expect(screen.getByText('Internet')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Agosto de 2026' }).parentElement,
    ).toHaveTextContent(formatCurrency(5000))

    fireEvent.click(screen.getByRole('tab', { name: 'Gastos' }))
    expect(screen.getByText('Super')).toBeInTheDocument()
    expect(screen.queryByText('Internet')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Agosto de 2026' }).parentElement,
    ).toHaveTextContent(formatCurrency(100))

    fireEvent.click(screen.getByRole('tab', { name: 'Todos' }))
    expect(screen.getByText('Super')).toBeInTheDocument()
    expect(screen.getByText('Internet')).toBeInTheDocument()
  })

  it('shows a message instead of an empty list when a filter has nothing to show', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Super',
      date: new Date(2026, 7, 5),
    })

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    await screen.findByText('Super')
    fireEvent.click(screen.getByRole('tab', { name: 'Servicios' }))

    expect(
      await screen.findByText('No hay servicios en tu histórico'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Super')).not.toBeInTheDocument()
  })
})
