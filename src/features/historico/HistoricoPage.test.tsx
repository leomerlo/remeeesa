import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
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
import {
  createPendiente,
  listPendientes,
  markPendientePaid,
} from '@/lib/pendientes'
import { createCard, createCardPurchase, markResumenPaid } from '@/lib/cards'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { HistoricoPage } from './HistoricoPage'

function renderPage(ui: ReactElement, url = '/') {
  return renderWithProviders(
    <MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>,
  )
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

    expect(
      await screen.findByText('Todavía no hay movimientos'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
  })

  it('shows an empty state for a household with no expenses', async () => {
    const { db } = await seedHousehold()

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    expect(
      screen.getByRole('heading', { name: 'Histórico' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Mes sin movimientos')).toBeInTheDocument()
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

  // The page's title-row button is gone -- the app header carries the one
  // add action at every width -- so what this screen offers on its own is
  // its empty month's call to action, which opens the very same sheet.
  it('opens the shared sheet from an empty month', async () => {
    const { db } = await seedHousehold()

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cargar un gasto' }),
    )

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
      await screen.findByText('Ningún servicio este mes'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Super')).not.toBeInTheDocument()
  })

  // Per direct feedback: a file of the month's movements, to open in a
  // spreadsheet and compare months by hand.
  it("exports the month's movements as a CSV", async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Super',
      date: new Date(),
      price: 1234.5,
    })

    // The download is a Blob handed to an <a>; capture it rather than
    // letting jsdom try to navigate.
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:test')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const clicked: HTMLAnchorElement[] = []
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this)
      })

    renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)
    await screen.findByText('Super')
    fireEvent.click(screen.getByRole('button', { name: /Exportar mes/ }))

    expect(clicked).toHaveLength(1)
    expect(clicked[0]?.download).toMatch(/^remeeesa-\d{4}-\d{2}\.csv$/)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    // The blob is released once the download has started; leaving it pins
    // the file in memory for the life of the page.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')

    const blob = createObjectURL.mock.calls[0]?.[0]
    expect(await blob?.text()).toContain('Super;Comida;Gasto;1234,50')

    clickSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  // Per direct feedback: forgiving, and across the whole history rather than
  // the month on screen -- a search that only looked at September would
  // answer "we never paid a plomero" when the answer was July.
  describe('search', () => {
    it('finds a movement from another month, with the pager stepping aside', async () => {
      const { db, householdId, categoryId } = await seedHousehold()
      await seed({
        db,
        householdId,
        categoryId,
        name: 'Plomero',
        date: new Date(2026, 6, 12),
      })
      await seed({
        db,
        householdId,
        categoryId,
        name: 'Super',
        date: new Date(),
      })

      renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)
      await screen.findByText('Super')
      expect(screen.queryByText('Plomero')).not.toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('Buscar movimientos'), {
        target: { value: 'plomero' },
      })

      expect(await screen.findByText('Plomero')).toBeInTheDocument()
      expect(screen.queryByText('Super')).not.toBeInTheDocument()
      // Browsing a month and searching everything are different modes, so
      // the pager is not left sitting there doing nothing.
      expect(
        screen.queryByRole('button', { name: 'Mes anterior' }),
      ).not.toBeInTheDocument()
    })

    it('forgives a typo and ignores accents', async () => {
      const { db, householdId, categoryId } = await seedHousehold()
      await seed({
        db,
        householdId,
        categoryId,
        name: 'Farmácia',
        date: new Date(),
      })

      renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)
      await screen.findByText('Farmácia')

      fireEvent.change(screen.getByLabelText('Buscar movimientos'), {
        target: { value: 'farmasia' },
      })

      expect(await screen.findByText('Farmácia')).toBeInTheDocument()
    })

    // Per direct feedback: it went straight to the empty state and produced
    // the result a moment later, so the app said "nothing found" before it
    // had looked.
    it('says it is searching rather than that nothing was found', async () => {
      const { db, householdId, categoryId } = await seedHousehold()
      await seed({
        db,
        householdId,
        categoryId,
        name: 'Plomero',
        date: new Date(2026, 6, 12),
      })
      // Hold the history back so the in-flight state is observable.
      let release = (): void => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const realList = db.listAllExpenses.bind(db)
      vi.spyOn(db, 'listAllExpenses').mockImplementation(async (input) => {
        await held
        return realList(input)
      })

      renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)
      await screen.findByRole('button', { name: 'Mes anterior' })
      fireEvent.change(screen.getByLabelText('Buscar movimientos'), {
        target: { value: 'plomero' },
      })

      expect(await screen.findByLabelText('Buscando…')).toBeInTheDocument()
      expect(screen.queryByText(/Sin resultados/)).not.toBeInTheDocument()

      release()
      expect(await screen.findByText('Plomero')).toBeInTheDocument()
    })

    it('keeps the box, and the way out, when nothing matches', async () => {
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

      const box = screen.getByLabelText('Buscar movimientos')
      fireEvent.change(box, { target: { value: 'zzz' } })
      expect(await screen.findByText(/Sin resultados/)).toBeInTheDocument()

      // Clearing it puts the month back.
      fireEvent.click(screen.getByRole('button', { name: 'Borrar búsqueda' }))
      expect(await screen.findByText('Super')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Mes anterior' }),
      ).toBeInTheDocument()
    })
  })

  it('opens on the month and category given in the URL', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    const other = (await listCategories({ db, householdId }))[1]
    if (other === undefined) {
      throw new Error('expected a second seeded category')
    }
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Alquiler',
      date: new Date(2026, 7, 3),
    })
    await seed({
      db,
      householdId,
      categoryId: other.id,
      name: 'Cine',
      date: new Date(2026, 7, 4),
    })
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Otro mes',
      date: new Date(2026, 6, 4),
    })

    renderPage(
      <HistoricoPage currentUserId="user-1" householdsDb={db} />,
      `/historico?month=2026-08&category=${categoryId}`,
    )

    expect(await screen.findByText('Alquiler')).toBeInTheDocument()
    expect(screen.queryByText('Cine')).not.toBeInTheDocument()
    expect(screen.queryByText('Otro mes')).not.toBeInTheDocument()
  })
})

describe('HistoricoPage card purchases', () => {
  it('lists a card purchase in its month, marked, without adding it to the total', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 20, 12))
    try {
      const { db, householdId, categoryId } = await seedHousehold()
      await seed({
        db,
        householdId,
        categoryId,
        name: 'Pan',
        date: new Date(2026, 8, 3),
        price: 25,
      })
      const visa = await createCard({ db, householdId, name: 'Visa' })
      await createCardPurchase({
        db,
        householdId,
        cardId: visa.id,
        categoryId,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: 'Zapatillas',
        total: 300,
        cuotas: 3,
        purchaseDate: new Date(2026, 8, 5),
        comments: '',
      })

      renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

      const list = await screen.findByRole('list', {
        name: 'Movimientos del mes',
      })
      expect(within(list).getByText('Zapatillas')).toBeInTheDocument()
      expect(
        within(list).getByText('Visa · 3 cuotas · no suma este mes'),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: 'Total del mes' }).parentElement,
      ).toHaveTextContent('$25')

      // Gastos keeps it; Servicios does not.
      fireEvent.click(screen.getByRole('tab', { name: 'Gastos' }))
      expect(screen.getByText('Zapatillas')).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: 'Total en gastos' }).parentElement,
      ).toHaveTextContent('$25')
      fireEvent.click(screen.getByRole('tab', { name: 'Servicios' }))
      expect(screen.queryByText('Zapatillas')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  async function seedPurchase() {
    const { db, householdId, categoryId } = await seedHousehold()
    const visa = await createCard({ db, householdId, name: 'Visa' })
    const master = await createCard({ db, householdId, name: 'Master' })
    await createCardPurchase({
      db,
      householdId,
      cardId: visa.id,
      categoryId,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Zapatillas',
      total: 300,
      cuotas: 3,
      purchaseDate: new Date(2026, 8, 5),
      comments: '',
    })
    return { db, householdId, visa, master }
  }

  it('shows a purchase with a cuota in a paid Resumen as locked, with no pencil', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    try {
      const { db, householdId, visa } = await seedPurchase()
      await markResumenPaid({
        db,
        householdId,
        resumenId: `${visa.id}_2026-10`,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        amountPaid: 100,
        paymentDate: new Date(2026, 9, 15),
      })
      renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)
      await goBackMonths(1)

      expect(await screen.findByText('Resumen pagado')).toBeInTheDocument()
      expect(
        screen.getByRole('img', {
          name: 'Tiene cuotas en un resumen ya pagado: no se puede editar ni borrar.',
        }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Editar Zapatillas' }),
      ).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens a card purchase in the add-gasto form, pre-filled, and saves any field', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 20, 12))
    try {
      const { db, householdId, master } = await seedPurchase()
      renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

      fireEvent.click(
        await screen.findByRole('button', { name: 'Editar Zapatillas' }),
      )

      const dialog = await screen.findByRole('dialog', {
        name: 'Editar compra',
      })
      expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Zapatillas')
      expect(within(dialog).getByLabelText('Fecha')).toHaveValue('2026-09-05')
      expect(
        within(dialog).getByLabelText('Método de pago'),
      ).toHaveDisplayValue('Visa')
      expect(within(dialog).getByLabelText('Cuotas')).toHaveValue(3)
      // It stays a card purchase.
      expect(
        within(dialog).queryByRole('option', { name: 'Efectivo' }),
      ).not.toBeInTheDocument()

      fireEvent.change(within(dialog).getByLabelText('Método de pago'), {
        target: { value: master.id },
      })
      fireEvent.change(within(dialog).getByLabelText('Cuotas'), {
        target: { value: '1' },
      })
      fireEvent.change(within(dialog).getByLabelText('Nombre'), {
        target: { value: 'Botines' },
      })
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Guardar cambios' }),
      )

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
      expect(
        await screen.findByText('Master · 1 cuota · no suma este mes'),
      ).toBeInTheDocument()
      expect(screen.getByText('Botines')).toBeInTheDocument()
      const resumenes = await listPendientes({ db, householdId })
      expect(
        resumenes.map((r) => [r.name, r.dueDate, r.expectedAmount]),
      ).toEqual([['Master', new Date(2026, 9, 10), 300]])
    } finally {
      vi.useRealTimers()
    }
  })

  it('deletes a card purchase after confirming, removing its Resúmenes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 20, 12))
    try {
      const { db, householdId } = await seedPurchase()
      renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

      fireEvent.click(
        await screen.findByRole('button', { name: 'Editar Zapatillas' }),
      )
      const dialog = await screen.findByRole('dialog')
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Eliminar compra' }),
      )
      const confirm = within(dialog).getByRole('alertdialog')
      fireEvent.click(
        within(confirm).getByRole('button', { name: 'Eliminar compra' }),
      )

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
      await waitFor(() => {
        expect(screen.queryByText('Zapatillas')).not.toBeInTheDocument()
      })
      expect(await listPendientes({ db, householdId })).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the purchase when the delete confirmation is cancelled', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 20, 12))
    try {
      const { db, householdId } = await seedPurchase()
      const before = await listPendientes({ db, householdId })
      renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

      fireEvent.click(
        await screen.findByRole('button', { name: 'Editar Zapatillas' }),
      )
      const dialog = await screen.findByRole('dialog')
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Eliminar compra' }),
      )
      fireEvent.click(
        within(within(dialog).getByRole('alertdialog')).getByRole('button', {
          name: 'Cancelar',
        }),
      )

      expect(within(dialog).queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(
        within(dialog).getByRole('button', { name: 'Guardar cambios' }),
      ).toBeInTheDocument()
      expect(await listPendientes({ db, householdId })).toEqual(before)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows why a delete was refused and keeps the sheet open', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 20, 12))
    try {
      const { db, householdId } = await seedPurchase()
      const [october] = await listPendientes({ db, householdId })
      if (october === undefined) {
        throw new Error('expected the October Resumen')
      }
      await markPendientePaid({
        db,
        householdId,
        pendienteId: october.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 100,
        paymentDate: new Date(),
      })
      renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

      fireEvent.click(
        await screen.findByRole('button', { name: 'Editar Zapatillas' }),
      )
      const dialog = await screen.findByRole('dialog')
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Eliminar compra' }),
      )
      fireEvent.click(
        within(within(dialog).getByRole('alertdialog')).getByRole('button', {
          name: 'Eliminar compra',
        }),
      )

      expect(
        await within(dialog).findByText(
          'El resumen de Visa de octubre de 2026 ya está pagado.',
        ),
      ).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(within(dialog).queryByRole('alertdialog')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows why an edit was refused and keeps the sheet open', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 20, 12))
    try {
      const { db } = await seedPurchase()
      renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

      fireEvent.click(
        await screen.findByRole('button', { name: 'Editar Zapatillas' }),
      )
      const dialog = await screen.findByRole('dialog')
      fireEvent.change(within(dialog).getByLabelText('Cuotas'), {
        target: { value: '30' },
      })
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Guardar cambios' }),
      )

      expect(
        await within(dialog).findByText(
          'Las cuotas deben ser un número entero entre 1 y 24',
        ),
      ).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows a month with only card purchases instead of the empty state', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 20, 12))
    try {
      const { db, householdId, categoryId } = await seedHousehold()
      const visa = await createCard({ db, householdId, name: 'Visa' })
      await createCardPurchase({
        db,
        householdId,
        cardId: visa.id,
        categoryId,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: 'Cena',
        total: 40,
        cuotas: 1,
        purchaseDate: new Date(2026, 8, 5),
        comments: '',
      })

      renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)

      expect(
        await screen.findByText('Visa · 1 cuota · no suma este mes'),
      ).toBeInTheDocument()
      expect(screen.queryByText('Mes sin movimientos')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves card purchases out of a search, which covers expenses only', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 20, 12))
    try {
      const { db, householdId, categoryId } = await seedHousehold()
      await seed({
        db,
        householdId,
        categoryId,
        name: 'Zapatos',
        date: new Date(2026, 8, 3),
      })
      const visa = await createCard({ db, householdId, name: 'Visa' })
      await createCardPurchase({
        db,
        householdId,
        cardId: visa.id,
        categoryId,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: 'Zapatillas',
        total: 300,
        cuotas: 3,
        purchaseDate: new Date(2026, 8, 5),
        comments: '',
      })

      renderPage(<HistoricoPage currentUserId="user-1" householdsDb={db} />)
      await screen.findByText('Zapatillas')

      fireEvent.change(screen.getByLabelText('Buscar movimientos'), {
        target: { value: 'Zapat' },
      })

      const results = await screen.findByRole('list', {
        name: 'Resultados de la búsqueda',
      })
      expect(within(results).getByText('Zapatos')).toBeInTheDocument()
      expect(within(results).queryByText('Zapatillas')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
