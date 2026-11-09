import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Card as PaymentMethod } from '@/lib/cards'
import { currentMonthRange } from '@/lib/expenses'
import type { Category } from '@/lib/expenses'
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
  readonly expenses: readonly { name: string; price: number }[]
  readonly pendientes: readonly { name: string; recurring: boolean }[]
  readonly purchases: readonly { name: string; cuotas: number }[]
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

  it('does not ask about months or payment on a credit card', async () => {
    const it_ = await house()
    open(it_)
    fireEvent.click(
      screen.getByRole('button', { name: /¿Con qué lo pagaron\?/ }),
    )
    fireEvent.click(screen.getByRole('option', { name: /Visa/ }))

    expect(screen.queryByRole('switch', { name: /Ya lo pagué/ })).toBeNull()
    expect(screen.queryByRole('switch', { name: /Todos los meses/ })).toBeNull()
    expect(screen.getByLabelText('En cuántas cuotas')).toBeInTheDocument()
  })
})
