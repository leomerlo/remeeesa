import { describe, expect, it } from 'vitest'
import {
  computePendingCommitted,
  computePercentUsed,
  computeRemainingBudget,
  computeSpentThisMonth,
  currentMonthRange,
  listExpensesInMonth,
} from '@/lib/expenses'
import { getHousehold, getMembership, monthlyBudgetFor } from '@/lib/households'
import { listPendientes, pendientesDueInMonth } from '@/lib/pendientes'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { DEMO_USER_ID, seedDemoHousehold } from './seed'

// Every scenario runs the same movements and only the budget moves, so the
// heat on the card is the one thing that tells them apart -- which makes
// the advertised percentage a claim worth checking. It drifted once
// already: the budget was worked out before the Visa statement was paid,
// and paying it turns cuotas into expenses, so every scenario ran ten
// points hotter than its own label said.
describe('every demo scenario lands on the heat it advertises', () => {
  it.each([
    ['arranque', 10],
    ['mitad', 50],
    ['ajustada', 80],
    ['completa', 96],
    ['pasada', 118],
    // Its label names the categories, not the heat; the seed asks for 62.
    ['muchas', 62],
  ] as const)('%s is %i%% used', async (scenario, expected) => {
    const db = createMemoryHouseholdsDb().asUser(DEMO_USER_ID)
    await seedDemoHousehold({ db, scenario })
    const membership = await getMembership({ db, userId: DEMO_USER_ID })
    if (membership === null) {
      throw new Error('expected a demo membership')
    }
    const householdId = membership.householdId
    const { monthStart, monthEnd } = currentMonthRange()
    const expenses = await listExpensesInMonth({
      db,
      householdId,
      monthStart,
      monthEnd,
    })
    const pending = pendientesDueInMonth(
      await listPendientes({ db, householdId }),
      monthStart,
      monthEnd,
    )
    const household = await getHousehold({ db, householdId })
    if (household === null) {
      throw new Error('expected a household')
    }
    const budget = monthlyBudgetFor(household, monthStart)
    const committed = computePendingCommitted(pending)

    expect(
      Math.abs(computePercentUsed(budget, expenses, committed) - expected),
    ).toBeLessThanOrEqual(1)
    // And the identity every screen leans on: what is left is the budget
    // minus what has gone and what is owed, with nothing counted twice.
    expect(computeRemainingBudget(budget, expenses, committed)).toBeCloseTo(
      budget - computeSpentThisMonth(expenses) - committed,
      2,
    )
  })
})
