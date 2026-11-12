import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RESUMEN_CATEGORY_NAME } from '@/lib/cards'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { MonthProvider } from '../MonthContext'
import { Proyecciones } from './Proyecciones'
import type { BetaSession } from '../data'

const FLOR = 'flor'

// A house whose only line in next month's projection is a card bill: one
// purchase in one cuota, which lands whole in the month the screen opens
// on. Everything else is left out so the figure on screen can only be the
// card's.
async function houseWithACardBill(): Promise<BetaSession> {
  const db = createMemoryHouseholdsDb().asUser(FLOR)
  const { household } = await db.createHouseholdAndMembership({
    userId: FLOR,
    name: 'Casa Merlo',
    monthlyBudget: 500_000,
    displayName: 'Flor',
  })
  const tarjeta = await db.findOrCreateCategory({
    householdId: household.id,
    name: RESUMEN_CATEGORY_NAME,
  })
  const ropa = await db.findOrCreateCategory({
    householdId: household.id,
    name: 'Ropa',
  })
  const card = await db.createCard({
    householdId: household.id,
    name: 'Visa',
    kind: 'credito',
    currency: 'ARS',
    brand: 'visa',
  })
  await db.createCardPurchase({
    householdId: household.id,
    cardId: card.id,
    categoryId: ropa.id,
    resumenCategoryId: tarjeta.id,
    memberId: FLOR,
    authorDisplayName: 'Flor',
    name: 'Zapatillas',
    total: 60_000,
    cuotas: 1,
    purchaseDate: new Date(),
    comments: '',
    currency: 'ARS',
  })
  return {
    userId: FLOR,
    householdId: household.id,
    displayName: 'Flor',
    db,
    adopt: vi.fn(),
    rename: vi.fn(),
  }
}

// The screen pages its own month, but it still sits inside the app's --
// the pager reads it to know whether there is a month ahead to go to.
// A day inside the month before the one the screen opens on, which is
// next month: the clock is frozen at 25 Sep 2026, so the screen shows
// October and carries September.
function lastMonth(): Date {
  return new Date(2026, 8, 15, 12)
}

function render(session: BetaSession): void {
  renderWithProviders(
    <MonthProvider>
      <Proyecciones session={session} />
    </MonthProvider>,
  )
}

// Paying a card bill writes its gastos into the card's own category, so
// carrying that category over from last month is a second guess at the
// same money the card line already carries. The line stands; the category
// does not -- and it has to stop being carried whatever it is called,
// because a household can rename it and the money does not care.
describe('the card is counted once', () => {
  it('leaves the card category out, even renamed', async () => {
    const session = await houseWithACardBill()
    const id = session.householdId as string
    const tarjeta = await session.db.findOrCreateCategory({
      householdId: id,
      name: RESUMEN_CATEGORY_NAME,
    })
    // Last month's card bill, paid: this is what would be carried.
    await session.db.createExpense({
      householdId: id,
      categoryId: tarjeta.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      name: 'Visa',
      price: 500_000,
      comments: '',
      expenseDate: lastMonth(),
      currency: 'ARS',
      paymentMethodId: null,
    })
    await session.db.renameCategory({
      householdId: id,
      categoryId: tarjeta.id,
      name: 'Tarjeta de crédito',
    })

    render(session)

    // The card's own line, and nothing else for the card: not the
    // $500.000 of last month's bill, and not a row for the category.
    expect(await screen.findByLabelText('Cuánto va a ser Visa')).toHaveValue(
      // Grouped, like every other figure on screen: the field formats as
      // it is typed. What it stores is the plain 60000.
      '60.000',
    )
    expect(screen.queryByText('Tarjeta de crédito')).toBeNull()
    expect(screen.getByText('$ 60.000')).toBeInTheDocument()
  })
})

// A projection is where somebody says "este mes sí vamos a gastar en
// esto", so every category the household has is on it -- including the
// ones neither month has anything in, which reading the two months alone
// never yields.
describe('the categories with nothing in them', () => {
  it('lists them at zero, beside the ones that have something', async () => {
    render(await houseWithACardBill())

    expect(await screen.findByLabelText('Cuánto va a ser Visa')).toHaveValue(
      // Grouped, like every other figure on screen: the field formats as
      // it is typed. What it stores is the plain 60000.
      '60.000',
    )
    // Ropa is the category the purchase was filed under, and nothing was
    // ever spent in it: a card purchase is not a gasto of any month.
    // Empty rather than a literal 0: the 0 is the placeholder, so typing
    // into it does not land "025000".
    expect(screen.getByLabelText('Cuánto va a ser Ropa')).toHaveValue('')
    expect(screen.getAllByText('Sin movimientos').length).toBeGreaterThan(0)
  })

  it('counts one as soon as a figure is typed into it', async () => {
    render(await houseWithACardBill())

    fireEvent.change(await screen.findByLabelText('Cuánto va a ser Ropa'), {
      target: { value: '25000' },
    })

    expect(screen.getByText('$ 85.000')).toBeInTheDocument()
  })
})

// The card's line is the one the app can fill in before the bill exists --
// and the one that is knowably short, because next month's own shopping is
// not in it. So it has to be possible to put a figure in over it, and to
// get back to the app's.
describe('typing over what the card is going to be', () => {
  it('offers the cuotas already bought, and says what is missing from them', async () => {
    render(await houseWithACardBill())

    expect(await screen.findByLabelText('Cuánto va a ser Visa')).toHaveValue(
      // Grouped, like every other figure on screen: the field formats as
      // it is typed. What it stores is the plain 60000.
      '60.000',
    )
    expect(screen.getByText('Cuotas ya compradas')).toBeInTheDocument()
    expect(
      screen.getByText(/Lo que compren ese mes todavía no está acá/),
    ).toBeInTheDocument()
  })

  it('takes a figure typed over it, into the total and into the line', async () => {
    render(await houseWithACardBill())

    fireEvent.change(await screen.findByLabelText('Cuánto va a ser Visa'), {
      target: { value: '150000' },
    })

    expect(screen.getByText('$ 150.000')).toBeInTheDocument()
    // The badge says where a line's figure comes from, so once it comes
    // from the household it stops claiming to be the cuotas.
    expect(screen.getByText('Puesto a mano')).toBeInTheDocument()
    expect(screen.queryByText('Cuotas ya compradas')).not.toBeInTheDocument()
  })

  it('gives the way back to the estimate, naming it', async () => {
    render(await houseWithACardBill())

    fireEvent.change(await screen.findByLabelText('Cuánto va a ser Visa'), {
      target: { value: '150000' },
    })
    fireEvent.click(
      // A regex, not the literal: the figure carries a non-breaking space
      // between its sign and its digits, which an accessible name keeps.
      screen.getByRole('button', { name: /Volver al estimado \(\$.60\.000\)/ }),
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Cuánto va a ser Visa')).toHaveValue(
        '60.000',
      )
    })
    expect(screen.getByText('Cuotas ya compradas')).toBeInTheDocument()
  })
})

// The dollars this screen used to read straight past. Her words: "al
// igual que las categorías, en las proyecciones tampoco está considerando
// los dólares, solo los pesos. Entonces siempre va a dar de menos".
describe('the dollars of the month ahead', () => {
  async function houseWithDollars(): Promise<BetaSession> {
    const db = createMemoryHouseholdsDb().asUser(FLOR)
    const { household } = await db.createHouseholdAndMembership({
      userId: FLOR,
      name: 'Casa Merlo',
      monthlyBudget: 500_000,
      displayName: 'Flor',
    })
    const comida = await db.findOrCreateCategory({
      householdId: household.id,
      name: 'Comida',
    })
    const suscripciones = await db.findOrCreateCategory({
      householdId: household.id,
      name: 'Suscripciones',
    })
    // Last month, in pesos: the line the projection has always carried.
    await db.createExpense({
      householdId: household.id,
      categoryId: comida.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      name: 'Super',
      price: 120_000,
      comments: '',
      expenseDate: lastMonth(),
      currency: 'ARS',
      paymentMethodId: null,
    })
    // And last month in dollars, in a category that has no pesos at all:
    // the one that used to project $0 with nothing said about it.
    await db.createExpense({
      householdId: household.id,
      categoryId: suscripciones.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      name: 'Hosting',
      price: 20,
      comments: '',
      expenseDate: lastMonth(),
      currency: 'USD',
      paymentMethodId: null,
    })
    // A bill in dollars due in the month the screen opens on.
    await db.createPendiente({
      householdId: household.id,
      categoryId: suscripciones.id,
      name: 'Netflix',
      dueDate: new Date(2026, 9, 10, 12),
      expectedAmount: 15.99,
      recurring: false,
      autoDebit: false,
      currency: 'USD',
    })
    return {
      userId: FLOR,
      householdId: household.id,
      displayName: 'Flor',
      db,
      adopt: vi.fn(),
      rename: vi.fn(),
    }
  }

  it('adds them up beside the pesos, never inside them', async () => {
    render(await houseWithDollars())

    // The pesos are the pesos: the dollar bill and the dollar gasto are
    // not in this figure.
    expect(await screen.findByText('$ 120.000')).toBeInTheDocument()
    // And the dollars have a figure of their own: US$ 20 carried plus the
    // US$ 15,99 of the bill.
    expect(screen.getByText('US$ 35,99')).toBeInTheDocument()
  })

  it("puts them in the line's own dollar field", async () => {
    render(await houseWithDollars())

    expect(
      await screen.findByLabelText('Cuánto va a ser Netflix en dólares'),
    ).toHaveValue('15,99')
    expect(
      screen.getByLabelText('Cuánto va a ser Suscripciones en dólares'),
    ).toHaveValue('20')
    // And the peso field of a line that only moves in dollars is empty,
    // not a 0 typed into it.
    expect(screen.getByLabelText('Cuánto va a ser Netflix')).toHaveValue('')
  })

  // The whole of her message: "en proyecciones los inputs quedaron solos
  // en pesos". A figure can be put in by hand on either side.
  it("takes a dollar figure typed over the month's", async () => {
    render(await houseWithDollars())

    fireEvent.change(
      await screen.findByLabelText('Cuánto va a ser Netflix en dólares'),
      { target: { value: '18' } },
    )

    // The dollars moved and the pesos did not.
    expect(screen.getByText('US$ 38')).toBeInTheDocument()
    expect(screen.getByText('$ 120.000')).toBeInTheDocument()
    expect(screen.getAllByText('Puesto a mano').length).toBe(1)
  })

  it('gives the way back to what the month said', async () => {
    render(await houseWithDollars())

    fireEvent.change(
      await screen.findByLabelText('Cuánto va a ser Netflix en dólares'),
      { target: { value: '18' } },
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: /Volver a los dólares del mes \(US\$.15,99\)/,
      }),
    )

    await waitFor(() => {
      expect(
        screen.getByLabelText('Cuánto va a ser Netflix en dólares'),
      ).toHaveValue('15,99')
    })
    expect(screen.getByText('US$ 35,99')).toBeInTheDocument()
  })

  it('drops them from the total when the line is switched off', async () => {
    render(await houseWithDollars())

    fireEvent.click(
      await screen.findByRole('switch', { name: /Contar Netflix/ }),
    )

    await waitFor(() => {
      expect(screen.getByText('US$ 20')).toBeInTheDocument()
    })
  })
})
