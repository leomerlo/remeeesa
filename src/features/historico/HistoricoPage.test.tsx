import { fireEvent, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import {
  createExpense,
  formatCurrency,
  listCategories,
  updateExpense,
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

// Histórico reads one month at a time now, so a test that seeds into a past
// month has to walk the pager back to it. The pager only appears once the
// membership resolves, hence the find rather than a get.
async function goBackMonths(count: number): Promise<void> {
  for (let step = 0; step < count; step += 1) {
    fireEvent.click(await screen.findByRole('button', { name: 'Mes anterior' }))
  }
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
    expect(
      await screen.findByText('No hay movimientos en este mes'),
    ).toBeInTheDocument()
  })

  it('lists the viewed month newest first', async () => {
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

    await goBackMonths(1)

    const august = await screen.findByRole('list', {
      name: 'Movimientos del mes',
    })
    const rows = within(august).getAllByRole('listitem')
    // Newest-first within the month.
    expect(rows[0]).toHaveTextContent('Cafe agosto')
    expect(rows[0]).toHaveTextContent('$4,70')
    expect(rows[1]).toHaveTextContent('Alquiler agosto')
    expect(rows[1]).toHaveTextContent('$300')
  })

  // Per direct feedback: the history is read a month at a time, paged by
  // the same control Home and Servicios use, rather than an endless
  // cursor-walk behind a "Cargar más" button.
  it('shows one month at a time and pages between them', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Ago 1',
      date: new Date(2026, 7, 1),
    })
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Jul 1',
      date: new Date(2026, 6, 1),
    })

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    await goBackMonths(1)
    expect(await screen.findByText('Ago 1')).toBeInTheDocument()
    expect(screen.queryByText('Jul 1')).not.toBeInTheDocument()

    await goBackMonths(1)
    expect(await screen.findByText('Jul 1')).toBeInTheDocument()
    expect(screen.queryByText('Ago 1')).not.toBeInTheDocument()
  })

  it('opens the shared edit sheet for an expense from a past month', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Gasto viejo',
      date: new Date(),
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
      date: new Date(),
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

  // Per direct feedback: this is the screen you are on when you notice a
  // gasto is missing, so it gets the same title-row action Servicios has.
  it('offers an add-expense button that opens the shared sheet', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Agregar gasto' }))

    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Precio')).toBeInTheDocument()
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
    expect(
      screen.getByRole('heading', { name: 'Total del mes' }).parentElement,
    ).toHaveTextContent('$100')
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
      date: new Date(),
    })

    await updateMemberDisplayName({
      db,
      householdId: household.id,
      userId: 'user-1',
      displayName: 'Jlors',
    })

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    // Editing is its own button now, so the name is asserted on the row it
    // sits in rather than on the button.
    const row = (
      await screen.findByRole('button', { name: 'Editar Veterinario' })
    ).closest('li')
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
      date: new Date(),
    })
    const pendiente = await createPendiente({
      db,
      householdId,
      categoryId,
      name: 'Internet',
      dueDate: new Date(),
      expectedAmount: 5000,
      // Recurring on purpose: that is what makes the Expense it generates a
      // Servicio. A one-off bill produces an ordinary Gasto.
      recurring: true,
    })
    await markPendientePaid({
      db,
      householdId,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 5000,
      paymentDate: new Date(),
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

  // isService is the manual override for an Expense with no real Pendiente
  // to link -- the only way to reclassify one that predates pendienteId.
  it('also marks an expense manually flagged with isService as "Servicio", and includes it in the Servicios filter', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    const gasto = await seed({
      db,
      householdId,
      categoryId,
      name: 'Super',
      date: new Date(),
    })
    const manualServicio = await seed({
      db,
      householdId,
      categoryId,
      name: 'Gimnasio',
      date: new Date(),
    })
    await updateExpense({
      db,
      householdId,
      expenseId: manualServicio.id,
      isService: true,
    })

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    const gastoRow = (
      await screen.findByRole('button', { name: `Editar ${gasto.name}` })
    ).closest('li')
    const servicioRow = screen
      .getByRole('button', { name: `Editar ${manualServicio.name}` })
      .closest('li')
    expect(gastoRow).not.toHaveTextContent('Servicio')
    expect(servicioRow).toHaveTextContent('Servicio')

    fireEvent.click(screen.getByRole('tab', { name: 'Servicios' }))
    expect(screen.queryByText('Super')).not.toBeInTheDocument()
    expect(screen.getByText('Gimnasio')).toBeInTheDocument()
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
      date: new Date(),
      price: 100,
    })
    const pendiente = await createPendiente({
      db,
      householdId,
      categoryId,
      name: 'Internet',
      dueDate: new Date(),
      expectedAmount: 5000,
      // Recurring on purpose: that is what makes the Expense it generates a
      // Servicio. A one-off bill produces an ordinary Gasto.
      recurring: true,
    })
    await markPendientePaid({
      db,
      householdId,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 5000,
      paymentDate: new Date(),
    })

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    await screen.findByText('Super')
    expect(screen.getByText('Internet')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Total del mes' }).parentElement,
    ).toHaveTextContent(formatCurrency(5100))

    fireEvent.click(screen.getByRole('tab', { name: 'Servicios' }))
    expect(screen.queryByText('Super')).not.toBeInTheDocument()
    expect(screen.getByText('Internet')).toBeInTheDocument()
    // The label follows the tab, so it says what the figure is a total of.
    expect(
      screen.getByRole('heading', { name: 'Total en servicios' }).parentElement,
    ).toHaveTextContent(formatCurrency(5000))

    fireEvent.click(screen.getByRole('tab', { name: 'Gastos' }))
    expect(screen.getByText('Super')).toBeInTheDocument()
    expect(screen.queryByText('Internet')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Total en gastos' }).parentElement,
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
      date: new Date(),
    })

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    await screen.findByText('Super')
    fireEvent.click(screen.getByRole('tab', { name: 'Servicios' }))

    expect(
      await screen.findByText('No hay servicios en este mes'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Super')).not.toBeInTheDocument()
  })
})
