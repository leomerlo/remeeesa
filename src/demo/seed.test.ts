import { describe, expect, it, vi } from 'vitest'
import { listCardPurchasesInMonth } from '@/lib/cards'
import {
  currentMonthRange,
  listCategories,
  listExpensesInMonth,
} from '@/lib/expenses'
import { getMembership } from '@/lib/households'
import { listPendientesForMonth } from '@/lib/pendientes'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { DEMO_USER_ID, seedDemoHousehold } from './seed'

describe('seedDemoHousehold', () => {
  it('gives the completa household card purchases, a paid Resumen with an ajuste and an unpaid one this month', async () => {
    const db = createMemoryHouseholdsDb().asUser(DEMO_USER_ID)
    await seedDemoHousehold({ db, scenario: 'completa' })
    const membership = await getMembership({ db, userId: DEMO_USER_ID })
    if (membership === null) {
      throw new Error('expected a demo membership')
    }
    const { householdId } = membership
    const { monthStart, monthEnd } = currentMonthRange()

    const resumenes = (
      await listPendientesForMonth({ db, householdId, monthStart, monthEnd })
    ).filter(
      (pendiente) =>
        pendiente.cardId !== undefined &&
        pendiente.dueDate >= monthStart &&
        pendiente.dueDate <= monthEnd,
    )
    // One settled and the rest still owed -- the month has three cards,
    // and the Amex is billed in both currencies, so it carries a peso
    // Resumen and a dollar one.
    expect(resumenes.map((resumen) => resumen.status).sort()).toEqual([
      'paid',
      'pending',
      'pending',
      'pending',
    ])
    expect(
      resumenes.filter((resumen) => resumen.currency === 'USD'),
    ).toHaveLength(1)

    const tarjeta = (await listCategories({ db, householdId })).find(
      (category) => category.name === 'Tarjeta',
    )
    const cardExpenses = (
      await listExpensesInMonth({ db, householdId, monthStart, monthEnd })
    ).filter((expense) => expense.categoryId === tarjeta?.id)
    expect(cardExpenses.some((expense) => expense.subcategory === null)).toBe(
      true,
    )
    expect(cardExpenses.some((expense) => expense.subcategory === 'Ropa')).toBe(
      true,
    )

    const lastMonth = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() - 1,
      1,
    )
    expect(
      await listCardPurchasesInMonth({
        db,
        householdId,
        monthStart: lastMonth,
        monthEnd: new Date(monthStart.getTime() - 1),
      }),
    ).not.toHaveLength(0)
  })

  it('gives the household to the user passed in, as seeding Firebase does', async () => {
    const db = createMemoryHouseholdsDb().asUser('real-uid')
    await seedDemoHousehold({
      db,
      scenario: 'completa',
      user: { id: 'real-uid', displayName: 'Seed' },
    })

    const membership = await getMembership({ db, userId: 'real-uid' })
    expect(membership).not.toBeNull()
    const { monthStart, monthEnd } = currentMonthRange()
    const expenses = await listExpensesInMonth({
      db,
      householdId: membership?.householdId ?? '',
      monthStart,
      monthEnd,
    })
    expect(expenses).not.toHaveLength(0)
    expect(expenses.every((expense) => expense.memberId === 'real-uid')).toBe(
      true,
    )
  })

  // Its gastos and payments are dated by day of the month; on an early day
  // they used to land in the future and the whole seed threw.
  it('still seeds completa on the first day of the month', async () => {
    vi.setSystemTime(new Date(2026, 9, 1, 10))
    const db = createMemoryHouseholdsDb().asUser(DEMO_USER_ID)

    await expect(
      seedDemoHousehold({ db, scenario: 'completa' }),
    ).resolves.toBeUndefined()
  })
})
