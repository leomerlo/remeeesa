import { waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RESUMEN_CATEGORY_NAME } from '@/lib/cards'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { useAutoDebits } from './useAutoDebits'
import type { BetaSession } from './data'

const FLOR = 'flor'
// The suite's clock is frozen at 25 Sep 2026, so this one was taken by the
// bank ten days ago.
const TAKEN = new Date(2026, 8, 15, 12)

async function house(options: {
  // true puts it on the credit card, 'debito' on the bank account, false
  // leaves it without a method at all.
  readonly onCard: boolean | 'debito'
}): Promise<{
  readonly session: BetaSession
  readonly householdId: string
  readonly billId: string
}> {
  const db = createMemoryHouseholdsDb().asUser(FLOR)
  const { household } = await db.createHouseholdAndMembership({
    userId: FLOR,
    name: 'Casa Merlo',
    monthlyBudget: 500_000,
    displayName: 'Flor',
  })
  const servicios = await db.findOrCreateCategory({
    householdId: household.id,
    name: 'Servicios',
  })
  await db.findOrCreateCategory({
    householdId: household.id,
    name: RESUMEN_CATEGORY_NAME,
  })
  const visa = await db.createCard({
    householdId: household.id,
    name: 'Visa',
    kind: 'credito',
    currency: 'ARS',
    brand: 'visa',
  })
  const santander = await db.createCard({
    householdId: household.id,
    name: 'Santander',
    kind: 'debito',
    currency: 'ARS',
    brand: 'otra',
  })
  const method =
    options.onCard === true
      ? visa.id
      : options.onCard === 'debito'
        ? santander.id
        : null
  const bill = await db.createPendiente({
    householdId: household.id,
    categoryId: servicios.id,
    name: 'Edenor',
    dueDate: TAKEN,
    expectedAmount: 36_800,
    recurring: true,
    autoDebit: true,
    paymentMethodId: method,
    currency: 'ARS',
  })
  return {
    householdId: household.id,
    billId: bill.id,
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

function Mounted({ session }: { readonly session: BetaSession }): null {
  useAutoDebits(session)
  return null
}

// The bills nobody pays, because the bank does. The badge and the toggle
// were there and the settling was not, so a servicio on débito automático
// sat unpaid for ever and went red.
describe('what the bank already took', () => {
  it('settles it on the card it is debited from, as a consumo', async () => {
    const { session, householdId, billId } = await house({ onCard: true })
    renderWithProviders(<Mounted session={session} />)

    await waitFor(async () => {
      const bill = await session.db.getPendiente({
        householdId,
        pendienteId: billId,
      })
      expect(bill?.status).toBe('paid')
    })

    const bill = await session.db.getPendiente({
      householdId,
      pendienteId: billId,
    })
    // On the card, which is what puts it on the "Con tarjeta" side of
    // Servicios -- and not among the month's gastos, because the money
    // has not left: it lands in the Visa's resumen.
    expect(bill?.paidPurchaseId ?? null).not.toBeNull()
    expect(bill?.paidExpenseId).toBeNull()
  })

  // A bill on débito automático is taken from an account or a card, never
  // from cash -- which is the one thing "no method" would end up
  // recording. A wrong answer is worse than a missing one here: the
  // household would have to undo the payment to correct it.
  it('leaves alone a bill that does not say what takes it', async () => {
    const { session, householdId, billId } = await house({ onCard: false })
    renderWithProviders(<Mounted session={session} />)

    await new Promise((resolve) => setTimeout(resolve, 50))
    const bill = await session.db.getPendiente({
      householdId,
      pendienteId: billId,
    })
    expect(bill?.status).toBe('pending')
  })

  it('settles it as a gasto when it is debited from an account', async () => {
    const { session, householdId, billId } = await house({ onCard: 'debito' })
    renderWithProviders(<Mounted session={session} />)

    await waitFor(async () => {
      const bill = await session.db.getPendiente({
        householdId,
        pendienteId: billId,
      })
      expect(bill?.status).toBe('paid')
    })

    const bill = await session.db.getPendiente({
      householdId,
      pendienteId: billId,
    })
    expect(bill?.paidExpenseId).not.toBeNull()
    expect(bill?.paidPurchaseId ?? null).toBeNull()
  })

  // A bill whose figure has not arrived has nothing to record, and
  // recording one would be inventing it.
  it('leaves a bill with no amount alone', async () => {
    const db = createMemoryHouseholdsDb().asUser(FLOR)
    const { household } = await db.createHouseholdAndMembership({
      userId: FLOR,
      name: 'Casa Merlo',
      monthlyBudget: 500_000,
      displayName: 'Flor',
    })
    const category = await db.findOrCreateCategory({
      householdId: household.id,
      name: 'Servicios',
    })
    const bill = await db.createPendiente({
      householdId: household.id,
      categoryId: category.id,
      name: 'Gas',
      dueDate: TAKEN,
      expectedAmount: null,
      recurring: true,
      autoDebit: true,
      currency: 'ARS',
    })
    const session: BetaSession = {
      userId: FLOR,
      householdId: household.id,
      displayName: 'Flor',
      db,
      adopt: vi.fn(),
      rename: vi.fn(),
    }
    renderWithProviders(<Mounted session={session} />)

    await new Promise((resolve) => setTimeout(resolve, 50))
    const after = await db.getPendiente({
      householdId: household.id,
      pendienteId: bill.id,
    })
    expect(after?.status).toBe('pending')
  })
})
