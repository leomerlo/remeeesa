import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Card as PaymentMethod, CardPurchase } from '@/lib/cards'
import { createCardPurchase, markPendientePaidWithCard } from '@/lib/cards'
import { createPendiente } from '@/lib/pendientes'
import { currentMonthRange } from '@/lib/expenses'
import type { Category, Expense } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { GastoSheet } from './GastoSheet'
import type { BetaSession } from '../data'

const FLOR = 'flor'
// Inside the month the whole suite's clock is frozen in: a gasto cannot be
// dated after today, and "today" here is 25 Sep 2026.
const TODAY = new Date(2026, 8, 20, 12)

type House = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categories: readonly Category[]
  readonly methods: readonly PaymentMethod[]
  readonly session: BetaSession
}

async function house(): Promise<House> {
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
  await db.findOrCreateCategory({
    householdId: household.id,
    name: 'Tarjeta',
  })
  const visa = await db.createCard({
    householdId: household.id,
    name: 'Visa',
    kind: 'credito',
    currency: 'ARS',
    brand: 'visa',
  })
  const debito = await db.createCard({
    householdId: household.id,
    name: 'Santander',
    kind: 'debito',
    currency: 'ARS',
    brand: 'otra',
  })
  return {
    db,
    householdId: household.id,
    categories: [comida],
    methods: [visa, debito],
    session: {
      userId: FLOR,
      householdId: household.id,
      displayName: 'Flor',
      db,
      adopt: vi.fn(),
      rename: vi.fn(),
    },
  }
}

function open(it: House): void {
  renderWithProviders(
    <GastoSheet
      open
      onClose={vi.fn()}
      session={it.session}
      expense={null}
      categories={it.categories}
      methods={it.methods}
      today={TODAY}
    />,
  )
}

function fill(name: string, amount: string): void {
  fireEvent.change(screen.getByLabelText('¿Qué fue?'), {
    target: { value: name },
  })
  if (amount !== '') {
    fireEvent.change(screen.getByLabelText('Cuánto'), {
      target: { value: amount },
    })
  }
}

async function movements(it: House): Promise<{
  readonly expenses: readonly Expense[]
  readonly pendientes: readonly { name: string; recurring: boolean }[]
  readonly purchases: readonly {
    name: string
    cuotas: number
    cardId: string
  }[]
}> {
  const { monthStart, monthEnd } = currentMonthRange(TODAY)
  const [expenses, pendientes, purchases] = await Promise.all([
    it.db.listExpensesInMonth({
      householdId: it.householdId,
      monthStart,
      monthEnd,
    }),
    it.db.listPendientes({ householdId: it.householdId }),
    it.db.listCardPurchasesInMonth({
      householdId: it.householdId,
      monthStart,
      monthEnd,
    }),
  ])
  return { expenses, pendientes, purchases }
}

// What the form decides, which is the whole of it: the same four answers
// write four different things. The v1 draws these lines and this follows
// them, because a household that learned the v1 should not have to learn
// a second set of rules.
describe('anotar un gasto', () => {
  it('writes a gasto when it is a one-off that was already paid', async () => {
    const it_ = await house()
    open(it_)
    fill('Super', '12000')
    fireEvent.click(screen.getByRole('button', { name: /Anotar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).expenses).toHaveLength(1)
    })
    const after = await movements(it_)
    expect(after.expenses[0]?.price).toBe(12_000)
    // Nothing waiting to be paid: it already was.
    expect(after.pendientes).toHaveLength(0)
  })

  // Her own case: anotar algo que todavía no pagó.
  it('writes a bill still owed when Ya lo pagué is off', async () => {
    const it_ = await house()
    open(it_)
    fill('Luz', '8000')
    fireEvent.click(screen.getByRole('switch', { name: /Ya lo pagué/ }))
    fireEvent.click(screen.getByRole('button', { name: /Anotar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).pendientes).toHaveLength(1)
    })
    const after = await movements(it_)
    expect(after.pendientes[0]?.name).toBe('Luz')
    // No money left the month: nobody paid anything.
    expect(after.expenses).toHaveLength(0)
  })

  it('takes a bill with no figure yet, which a paid one would refuse', async () => {
    const it_ = await house()
    open(it_)
    fill('Gas', '')
    fireEvent.click(screen.getByRole('switch', { name: /Ya lo pagué/ }))
    fireEvent.click(screen.getByRole('button', { name: /Anotar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).pendientes).toHaveLength(1)
    })
  })

  // Something that comes every month is a servicio even when it is paid
  // on the spot: it is written as the bill it is and settled at once, so
  // it comes back by itself next month.
  it('writes a servicio and settles it when it is monthly and already paid', async () => {
    const it_ = await house()
    open(it_)
    fill('Internet', '30000')
    fireEvent.click(screen.getByRole('switch', { name: /Todos los meses/ }))
    fireEvent.click(screen.getByRole('button', { name: /Anotar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).expenses).toHaveLength(1)
    })
    const after = await movements(it_)
    // listPendientes returns only what is still owed, and this one is not.
    expect(after.pendientes).toHaveLength(0)
    expect(after.expenses[0]?.name).toBe('Internet')
  })

  // Her own case, and the one the form refused to describe: la Visa
  // debita Netflix todos los meses. The card says how it is paid; the
  // three switches say what it is, and picking a card used to hide them.
  it('asks the same three questions on a credit card', async () => {
    const it_ = await house()
    open(it_)
    fill('Netflix', '9000')
    fireEvent.click(
      screen.getByRole('button', { name: /¿Con qué lo pagaron\?/ }),
    )
    fireEvent.click(screen.getByRole('option', { name: /Visa/ }))

    expect(
      screen.getByRole('switch', { name: /Ya lo pagué/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: /Todos los meses/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: /Débito automático/ }),
    ).toBeInTheDocument()
  })

  it('writes a servicio that the card pays every month', async () => {
    const it_ = await house()
    open(it_)
    fill('Netflix', '9000')
    fireEvent.click(
      screen.getByRole('button', { name: /¿Con qué lo pagaron\?/ }),
    )
    fireEvent.click(screen.getByRole('option', { name: /Visa/ }))
    fireEvent.click(screen.getByRole('switch', { name: /Todos los meses/ }))
    fireEvent.click(screen.getByRole('button', { name: /Anotar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).purchases).toHaveLength(1)
    })
    const after = await movements(it_)
    // On the card, so it lands in the Resumen and not in this month: no
    // gasto anywhere, and the consumo says which bill it came from.
    expect(after.expenses).toHaveLength(0)
    expect(after.purchases[0]?.name).toBe('Netflix')
    // And it is a servicio, so it comes back next month.
    const bills = await it_.db.listPaidPendientesDueInMonth({
      householdId: it_.householdId,
      ...currentMonthRange(TODAY),
    })
    expect(bills.map((bill) => [bill.name, bill.recurring])).toEqual([
      ['Netflix', true],
    ])
  })

  it('writes a bill the card is going to pay when it is not paid yet', async () => {
    const it_ = await house()
    open(it_)
    fill('Expensas', '45000')
    fireEvent.click(
      screen.getByRole('button', { name: /¿Con qué lo pagaron\?/ }),
    )
    fireEvent.click(screen.getByRole('option', { name: /Visa/ }))
    fireEvent.click(screen.getByRole('switch', { name: /Ya lo pagué/ }))
    fireEvent.click(screen.getByRole('button', { name: /Anotar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).pendientes).toHaveLength(1)
    })
    const after = await movements(it_)
    // Nothing has been paid, so there is no consumo and no gasto: only
    // the bill, which remembers what is going to pay it.
    expect(after.purchases).toHaveLength(0)
    expect(after.expenses).toHaveLength(0)
    const [bill] = await it_.db.listPendientes({
      householdId: it_.householdId,
    })
    expect(bill?.paymentMethodId).toBe(it_.methods[0]?.id)
  })

  it('writes a consumo, not a gasto, when it goes on a credit card', async () => {
    const it_ = await house()
    open(it_)
    fill('Zapatillas', '90000')
    fireEvent.click(
      screen.getByRole('button', { name: /¿Con qué lo pagaron\?/ }),
    )
    fireEvent.click(screen.getByRole('option', { name: /Visa/ }))
    fireEvent.click(screen.getByRole('button', { name: /Anotar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).purchases).toHaveLength(1)
    })
    const after = await movements(it_)
    expect(after.purchases[0]?.name).toBe('Zapatillas')
    // A consumo is not money out of this month: it arrives when the card's
    // resumen is paid.
    expect(after.expenses).toHaveLength(0)
  })

  it('asks about the cuotas as well, on a credit card', async () => {
    const it_ = await house()
    open(it_)
    fireEvent.click(
      screen.getByRole('button', { name: /¿Con qué lo pagaron\?/ }),
    )
    fireEvent.click(screen.getByRole('option', { name: /Visa/ }))

    expect(screen.getByLabelText('En cuántas cuotas')).toBeInTheDocument()
  })
})

// An amount is written here with a dot between the thousands and a comma
// before the decimals, and a phone's number pad types "." for that comma.
// The field used to take whatever was in it and strip the separators, so
// "1.234,56" went in as one thousand two hundred and thirty-four fifty-six
// -- right -- and "1234.56" went in as a hundred and twenty-three
// thousand. Both now mean the same thing, which they do everywhere else in
// the app too. Her own case.
describe('an amount written the way it is written here', () => {
  it('reads a dot as thousands and a comma as the decimals', async () => {
    const it_ = await house()
    open(it_)
    fill('Super', '36.800')
    // And shows it back separated, the way every figure on screen is.
    expect(screen.getByLabelText('Cuánto')).toHaveValue('36.800')
    fireEvent.click(screen.getByRole('button', { name: /Anotar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).expenses).toHaveLength(1)
    })
    expect((await movements(it_)).expenses[0]?.price).toBe(36_800)
  })

  it('reads a typed dot as the decimal point when that is all it can be', async () => {
    const it_ = await house()
    open(it_)
    fill('Café', '1234.56')
    expect(screen.getByLabelText('Cuánto')).toHaveValue('1.234,56')
    fireEvent.click(screen.getByRole('button', { name: /Anotar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).expenses).toHaveLength(1)
    })
    expect((await movements(it_)).expenses[0]?.price).toBe(1234.56)
  })

  it('keeps a gasto with decimals the same when it is opened and saved', async () => {
    const it_ = await house()
    const [comida] = it_.categories
    if (comida === undefined) throw new Error('no category')
    const expense = await it_.db.createExpense({
      householdId: it_.householdId,
      categoryId: comida.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      name: 'Verdulería',
      price: 1234.56,
      comments: '',
      expenseDate: TODAY,
      currency: 'ARS',
      paymentMethodId: null,
    })
    renderWithProviders(
      <GastoSheet
        open
        onClose={vi.fn()}
        session={it_.session}
        expense={expense}
        categories={it_.categories}
        methods={it_.methods}
        today={TODAY}
      />,
    )

    // Opened on the stored figure, written the way it is read.
    expect(screen.getByLabelText('Cuánto')).toHaveValue('1.234,56')
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(async () => {
      const after = await movements(it_)
      expect(after.expenses[0]?.price).toBe(1234.56)
    })
  })
})

// The category box. A dropdown of what the household already has cannot
// name one it does not, and naming one is the half that matters:
// anotando la panadería, nobody should have to leave the form, make a
// category and come back. Per direct feedback: "habíamos dicho que era
// un autocomplete".
describe('choosing or naming a category', () => {
  // The field is the box: clicking it puts the cursor in it and drops
  // the list under it. There is nothing to open first.
  function openList(): void {
    fireEvent.focus(screen.getByLabelText('Categoría'))
  }

  function type(text: string): void {
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: text },
    })
  }

  it('narrows what the household already has', async () => {
    const it_ = await house()
    open(it_)
    openList()

    type('com')
    expect(screen.getByRole('option', { name: 'Comida' })).toBeInTheDocument()
    type('zzz')
    expect(screen.queryByRole('option', { name: 'Comida' })).toBeNull()
  })

  it('makes the category when a name nobody has is saved', async () => {
    const it_ = await house()
    open(it_)
    fill('Facturas', '4500')
    openList()
    type('Panadería')
    fireEvent.click(screen.getByRole('option', { name: /Crear «Panadería»/ }))

    // Nothing is written while the form is open: the name is carried as
    // a name, and the category is made by the save.
    expect(
      (await it_.db.listCategories(it_.householdId)).map(
        (category) => category.name,
      ),
    ).not.toContain('Panadería')

    fireEvent.click(screen.getByRole('button', { name: /Anotar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).expenses).toHaveLength(1)
    })
    const categories = await it_.db.listCategories(it_.householdId)
    const made = categories.find((category) => category.name === 'Panadería')
    expect(made).toBeDefined()
    const [gasto] = await it_.db.listExpensesInMonth({
      householdId: it_.householdId,
      ...currentMonthRange(TODAY),
    })
    expect(gasto?.categoryId).toBe(made?.id)
  })

  it('offers no new category for a name that is already one', async () => {
    const it_ = await house()
    open(it_)
    openList()
    type('Comida')

    expect(screen.queryByRole('option', { name: /Crear/ })).toBeNull()
    expect(screen.getByRole('option', { name: 'Comida' })).toBeInTheDocument()
  })

  it('still files a gasto under a category that already exists', async () => {
    const it_ = await house()
    open(it_)
    fill('Super', '12000')
    openList()
    fireEvent.click(screen.getByRole('option', { name: 'Comida' }))
    fireEvent.click(screen.getByRole('button', { name: /Anotar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).expenses).toHaveLength(1)
    })
    const categories = await it_.db.listCategories(it_.householdId)
    const comida = categories.find((category) => category.name === 'Comida')
    const [gasto] = await it_.db.listExpensesInMonth({
      householdId: it_.householdId,
      ...currentMonthRange(TODAY),
    })
    expect(gasto?.categoryId).toBe(comida?.id)
  })
})

// The same three questions when editing as when anotando: what a record
// is, is exactly what somebody comes back to change. The redesign hid
// them on edit, so a servicio anotado como gasto had no way back; the v1
// had the conversion all along. Per direct feedback: "si yo me confundí
// y anoté un servicio como gasto, tengo que poder editarlo y hacerlo
// servicio".
describe('editing a gasto into a servicio', () => {
  async function loggedGasto(it_: House): Promise<Expense> {
    const gasto = await it_.db.createExpense({
      householdId: it_.householdId,
      categoryId: it_.categories[0]?.id ?? '',
      memberId: FLOR,
      authorDisplayName: 'Flor',
      name: 'Gimnasio',
      price: 30_000,
      comments: '',
      expenseDate: TODAY,
      currency: 'ARS',
      paymentMethodId: null,
    })
    return gasto
  }

  // A servicio the conversion already settled is paid, and a paid bill is
  // not in listPendientes -- the same way Firestore keeps them out. So it
  // is read where Servicios reads it.
  async function settled(
    it_: House,
  ): Promise<readonly { name: string; recurring: boolean }[]> {
    return it_.db.listPaidPendientesDueInMonth({
      householdId: it_.householdId,
      ...currentMonthRange(TODAY),
    })
  }

  function edit(it_: House, expense: Expense): void {
    renderWithProviders(
      <GastoSheet
        open
        onClose={vi.fn()}
        session={it_.session}
        expense={expense}
        categories={it_.categories}
        methods={it_.methods}
        today={TODAY}
      />,
    )
  }

  it('asks the same questions it asked when anotando', async () => {
    const it_ = await house()
    edit(it_, await loggedGasto(it_))

    expect(
      screen.getByRole('switch', { name: /Ya lo pagué/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: /Todos los meses/ }),
    ).toBeInTheDocument()
  })

  it('turns it into a servicio that comes back every month', async () => {
    const it_ = await house()
    edit(it_, await loggedGasto(it_))

    fireEvent.click(screen.getByRole('switch', { name: /Todos los meses/ }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(async () => {
      expect(await settled(it_)).toHaveLength(1)
    })
    const bills = await settled(it_)
    expect(bills[0]?.name).toBe('Gimnasio')
    expect(bills[0]?.recurring).toBe(true)
    // Still paid, and still one record: the gasto the conversion rebuilt
    // is the only one left, and it now says it is a servicio -- which is
    // what keeps it off Gastos and on Servicios.
    const after = await movements(it_)
    expect(after.expenses).toHaveLength(1)
    expect(after.expenses[0]?.price).toBe(30_000)
    expect(after.expenses[0]?.isService).toBe(true)
  })

  it('carries the edits made in the same save onto the servicio', async () => {
    const it_ = await house()
    edit(it_, await loggedGasto(it_))

    fireEvent.change(screen.getByLabelText('¿Qué fue?'), {
      target: { value: 'Gimnasio Flor' },
    })
    fireEvent.click(screen.getByRole('switch', { name: /Todos los meses/ }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(async () => {
      expect(await settled(it_)).toHaveLength(1)
    })
    expect((await settled(it_))[0]?.name).toBe('Gimnasio Flor')
  })

  it('turns it into a bill still owed when Ya lo pagué goes off', async () => {
    const it_ = await house()
    edit(it_, await loggedGasto(it_))

    fireEvent.click(screen.getByRole('switch', { name: /Ya lo pagué/ }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).pendientes).toHaveLength(1)
    })
    const after = await movements(it_)
    // Owed, so no money left the month at all.
    expect(after.expenses).toHaveLength(0)
  })

  // The other direction of the same mistake: lo pagué con la Visa y lo
  // anoté como gasto. The form offers the cards here too, and saying so
  // moves the money to the card's resumen.
  it('moves it onto the card when a credit card is picked', async () => {
    const it_ = await house()
    edit(it_, await loggedGasto(it_))

    fireEvent.click(
      screen.getByRole('button', { name: /¿Con qué lo pagaron\?/ }),
    )
    fireEvent.click(screen.getByRole('option', { name: /Visa/ }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).purchases).toHaveLength(1)
    })
    const after = await movements(it_)
    expect(after.purchases[0]?.name).toBe('Gimnasio')
    // And it is no longer money of this month: it arrives with the
    // card's resumen.
    expect(after.expenses).toHaveLength(0)
  })

  it('leaves an ordinary edit an ordinary gasto', async () => {
    const it_ = await house()
    edit(it_, await loggedGasto(it_))

    fireEvent.change(screen.getByLabelText('Cuánto'), {
      target: { value: '35000' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).expenses[0]?.price).toBe(35_000)
    })
    expect((await movements(it_)).pendientes).toHaveLength(0)
  })
})

// A consumo is the same form as a gasto, and the method is the question
// that decides which of the two the record is. Her case: "si me confundí
// y le quiero sacar que lo pagué con tarjeta porque me confundí, lo tengo
// que poder editar".
describe('editar un consumo', () => {
  async function loggedConsumo(it_: House): Promise<CardPurchase> {
    return createCardPurchase({
      db: it_.db,
      householdId: it_.householdId,
      cardId: it_.methods[0]?.id ?? '',
      categoryId: it_.categories[0]?.id ?? '',
      memberId: FLOR,
      authorDisplayName: 'Flor',
      name: 'Zapatillas',
      total: 90_000,
      cuotas: 3,
      purchaseDate: TODAY,
      comments: '',
    })
  }

  function edit(it_: House, purchase: CardPurchase): void {
    renderWithProviders(
      <GastoSheet
        open
        onClose={vi.fn()}
        session={it_.session}
        expense={null}
        purchase={purchase}
        categories={it_.categories}
        methods={it_.methods}
        today={TODAY}
      />,
    )
  }

  it('offers cash, the same as the gasto form does', async () => {
    const it_ = await house()
    edit(it_, await loggedConsumo(it_))

    fireEvent.click(
      screen.getByRole('button', { name: /¿Con qué lo pagaron\?/ }),
    )
    expect(
      screen.getByRole('option', { name: /Efectivo o transferencia/ }),
    ).toBeInTheDocument()
  })

  it('turns it into a gasto of the month when it comes off the card', async () => {
    const it_ = await house()
    edit(it_, await loggedConsumo(it_))

    fireEvent.click(
      screen.getByRole('button', { name: /¿Con qué lo pagaron\?/ }),
    )
    fireEvent.click(
      screen.getByRole('option', { name: /Efectivo o transferencia/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).expenses).toHaveLength(1)
    })
    const after = await movements(it_)
    expect(after.expenses[0]?.name).toBe('Zapatillas')
    expect(after.expenses[0]?.price).toBe(90_000)
    expect(after.expenses[0]?.paymentMethodId).toBeNull()
    // And it is off the card: no consumo, and no Resumen left holding a
    // cuota of it.
    expect(after.purchases).toHaveLength(0)
    expect(after.pendientes).toHaveLength(0)
  })

  it('keeps it a consumo when it moves to another card', async () => {
    const it_ = await house()
    const otra = await it_.db.createCard({
      householdId: it_.householdId,
      name: 'Amex',
      kind: 'credito',
      currency: 'ARS',
      brand: 'amex',
    })
    renderWithProviders(
      <GastoSheet
        open
        onClose={vi.fn()}
        session={it_.session}
        expense={null}
        purchase={await loggedConsumo(it_)}
        categories={it_.categories}
        methods={[...it_.methods, otra]}
        today={TODAY}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /¿Con qué lo pagaron\?/ }),
    )
    fireEvent.click(screen.getByRole('option', { name: /Amex/ }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).purchases[0]?.cardId).toBe(otra.id)
    })
    expect((await movements(it_)).expenses).toHaveLength(0)
  })

  // A consumo that turns out to come every month: Netflix en la Visa.
  // The same three switches as everywhere else, and saying yes writes
  // the servicio and takes the loose consumo away.
  it('becomes a servicio paid with the card when it comes every month', async () => {
    const it_ = await house()
    edit(it_, await loggedConsumo(it_))

    fireEvent.click(screen.getByRole('switch', { name: /Todos los meses/ }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(async () => {
      const bills = await it_.db.listPaidPendientesDueInMonth({
        householdId: it_.householdId,
        ...currentMonthRange(TODAY),
      })
      expect(bills).toHaveLength(1)
    })
    const after = await movements(it_)
    // One consumo, not two: the loose one was removed and the servicio's
    // own took its place.
    expect(after.purchases).toHaveLength(1)
    expect(after.expenses).toHaveLength(0)
  })

  // The consumo of a servicio paid before consumos carried a mark of
  // their own: it says nothing about where it came from, and the link is
  // on the bill. The screen reads it there and hands it over, so the
  // save treats it as the payment it is -- editing it used to write a
  // second bill beside the one already there: "tenía un gasto de Claro,
  // lo paso a tarjeta y se me duplicó".
  it('does not write a second bill when the consumo already pays one', async () => {
    const it_ = await house()
    const bill = await createPendiente({
      db: it_.db,
      householdId: it_.householdId,
      categoryId: it_.categories[0]?.id ?? '',
      name: 'Claro',
      dueDate: TODAY,
      expectedAmount: 12_000,
      recurring: true,
      autoDebit: true,
    })
    // Paid with the card, and the consumo carries no mark -- which is
    // every one written before the mark existed.
    const consumo = await createCardPurchase({
      db: it_.db,
      householdId: it_.householdId,
      cardId: it_.methods[0]?.id ?? '',
      categoryId: it_.categories[0]?.id ?? '',
      memberId: FLOR,
      authorDisplayName: 'Flor',
      name: 'Claro',
      total: 12_000,
      cuotas: 1,
      purchaseDate: TODAY,
      comments: '',
    })
    renderWithProviders(
      <GastoSheet
        open
        onClose={vi.fn()}
        session={it_.session}
        expense={null}
        purchase={consumo}
        billId={bill.id}
        categories={it_.categories}
        methods={it_.methods}
        today={TODAY}
      />,
    )

    fireEvent.click(screen.getByRole('switch', { name: /Todos los meses/ }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).pendientes[0]?.recurring).toBe(true)
    })
    // One Claro in the whole month, counting both sides: listPendientes
    // holds what is still owed and the paid ones live apart, so a second
    // bill written already-paid hides from the first list alone.
    const [owed, paid] = await Promise.all([
      it_.db.listPendientes({ householdId: it_.householdId }),
      it_.db.listPaidPendientesDueInMonth({
        householdId: it_.householdId,
        ...currentMonthRange(TODAY),
      }),
    ])
    expect(
      [...owed, ...paid].filter((one) => one.name === 'Claro'),
    ).toHaveLength(1)
    // And its consumo was left where it was.
    expect((await movements(it_)).purchases).toHaveLength(1)
  })

  // The consumo a servicio's payment wrote. The same form, the same
  // questions: picking cash on it undoes the card payment and pays the
  // bill in cash instead -- it stays the servicio it is.
  it('pays the servicio in cash when the consumo comes off the card', async () => {
    const it_ = await house()
    const bill = await createPendiente({
      db: it_.db,
      householdId: it_.householdId,
      categoryId: it_.categories[0]?.id ?? '',
      name: 'Claro',
      dueDate: TODAY,
      expectedAmount: 12_000,
    })
    const { purchase } = await markPendientePaidWithCard({
      db: it_.db,
      householdId: it_.householdId,
      pendienteId: bill.id,
      cardId: it_.methods[0]?.id ?? '',
      memberId: FLOR,
      authorDisplayName: 'Flor',
      finalAmount: 12_000,
      cuotas: 1,
      paymentDate: TODAY,
      currency: 'ARS',
    })
    edit(it_, purchase)

    fireEvent.click(
      screen.getByRole('button', { name: /¿Con qué lo pagaron\?/ }),
    )
    fireEvent.click(
      screen.getByRole('option', { name: /Efectivo o transferencia/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(async () => {
      expect((await movements(it_)).purchases).toHaveLength(0)
    })
    const after = await movements(it_)
    // Paid in cash now: the money left this month, and the bill still
    // says it is paid.
    expect(after.expenses).toHaveLength(1)
    expect(after.expenses[0]?.pendienteId).toBe(bill.id)
    expect(after.pendientes).toHaveLength(0)
  })
})

// The whole of what she asked for, checked as one thing: anotar, editar
// un gasto y editar un consumo son el mismo formulario. "Nada tiene que
// cambiar, todos los modales en todos los casos deben de ser iguales."
describe('el mismo formulario en los tres casos', () => {
  function shown(): {
    readonly fields: readonly string[]
    readonly switches: readonly string[]
  } {
    return {
      // Every question the sheet puts on screen, by the label over it.
      fields: [...document.querySelectorAll('.field > label')]
        .map((label) => label.textContent ?? '')
        // The cuotas only belong to a credit card, and a consumo opens on
        // one while an alta opens on cash. It is the same question in all
        // three, asked when a card is picked.
        .filter((label) => !label.startsWith('En cuántas cuotas')),
      switches: screen
        .getAllByRole('switch')
        .map((control) => (control.textContent ?? '').slice(0, 20)),
    }
  }

  it('ofrece las mismas preguntas en los tres', async () => {
    const it_ = await house()

    const alta = renderWithProviders(
      <GastoSheet
        open
        onClose={vi.fn()}
        session={it_.session}
        expense={null}
        categories={it_.categories}
        methods={it_.methods}
        today={TODAY}
      />,
    )
    const altaShown = shown()
    alta.unmount()

    const gasto = renderWithProviders(
      <GastoSheet
        open
        onClose={vi.fn()}
        session={it_.session}
        expense={await it_.db.createExpense({
          householdId: it_.householdId,
          categoryId: it_.categories[0]?.id ?? '',
          memberId: FLOR,
          authorDisplayName: 'Flor',
          name: 'Super',
          price: 12_000,
          comments: '',
          expenseDate: TODAY,
          currency: 'ARS',
          paymentMethodId: null,
        })}
        categories={it_.categories}
        methods={it_.methods}
        today={TODAY}
      />,
    )
    const gastoShown = shown()
    gasto.unmount()

    renderWithProviders(
      <GastoSheet
        open
        onClose={vi.fn()}
        session={it_.session}
        expense={null}
        purchase={await createCardPurchase({
          db: it_.db,
          householdId: it_.householdId,
          cardId: it_.methods[0]?.id ?? '',
          categoryId: it_.categories[0]?.id ?? '',
          memberId: FLOR,
          authorDisplayName: 'Flor',
          name: 'Zapatillas',
          total: 90_000,
          cuotas: 3,
          purchaseDate: TODAY,
          comments: '',
        })}
        categories={it_.categories}
        methods={it_.methods}
        today={TODAY}
      />,
    )
    const consumoShown = shown()

    // The same three switches, whatever it was opened on.
    expect(gastoShown.switches).toEqual(altaShown.switches)
    expect(consumoShown.switches).toEqual(altaShown.switches)
    // And the same questions, up to the one word that says whether this
    // is an alta or an edición (the save button) and the delete at the
    // foot of an edición.
    const asked = (labels: readonly string[]): readonly string[] =>
      labels.filter(
        (label) => !label.startsWith('Borrar') && !label.startsWith('Cerrar'),
      )
    expect(asked(gastoShown.fields)).toEqual(asked(altaShown.fields))
    expect(asked(consumoShown.fields)).toEqual(asked(altaShown.fields))
  })
})
