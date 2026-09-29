import { describe, expect, it } from 'vitest'
import { currentMonthRange, findOrCreateCategory } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import {
  createPendiente,
  listPendientesForMonth,
  markPendientePaid,
} from './pendientes'

const SEPTEMBER = new Date(2026, 8, 1)
const OCTOBER = new Date(2026, 9, 1)
const AUGUST = new Date(2026, 7, 1)

async function household() {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const created = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 900000,
  })
  const category = await findOrCreateCategory({
    db,
    householdId: created.id,
    name: 'Servicios',
  })
  return { db, householdId: created.id, categoryId: category.id }
}

// Only the settled half. listPendientesForMonth deliberately returns every
// still-pending bill regardless of month -- an overdue one stays actionable
// -- and the screen narrows that half itself; what this file is about is
// which month a *paid* servicio is filed under.
function settledNames(
  pendientes: readonly { name: string; status: string }[],
): string[] {
  return pendientes
    .filter((pendiente) => pendiente.status === 'paid')
    .map((pendiente) => pendiente.name)
}

// A servicio belongs to the month it is *due*, whichever month it happened to
// be paid in. Scoping the paid half by payment date instead put next month's
// bill in this month's list the moment it was paid early -- and took it out
// of next month's list entirely, where its due date says it belongs.
describe('a servicio stays in the month it is due', () => {
  it('keeps a bill paid a month early in the month it is due for', async () => {
    const { db, householdId, categoryId } = await household()
    const octoberBill = await createPendiente({
      db,
      householdId,
      categoryId,
      name: 'Seguro vivienda',
      dueDate: new Date(2026, 9, 10),
      expectedAmount: 50000,
      recurring: true,
    })

    // Settled on 20 September, a month before it falls due.
    await markPendientePaid({
      db,
      householdId,
      pendienteId: octoberBill.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 50000,
      paymentDate: new Date(2026, 8, 20),
    })

    const september = await listPendientesForMonth({
      db,
      householdId,
      ...currentMonthRange(SEPTEMBER),
    })
    const october = await listPendientesForMonth({
      db,
      householdId,
      ...currentMonthRange(OCTOBER),
    })

    expect(settledNames(september)).not.toContain('Seguro vivienda')
    expect(settledNames(october)).toContain('Seguro vivienda')
  })

  it('files the cycle just paid under its own month, not the payment date', async () => {
    const { db, householdId, categoryId } = await household()
    const septemberBill = await createPendiente({
      db,
      householdId,
      categoryId,
      name: 'Seguro vivienda',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 50000,
      recurring: true,
    })

    await markPendientePaid({
      db,
      householdId,
      pendienteId: septemberBill.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 50000,
      paymentDate: new Date(2026, 8, 10),
    })

    const september = await listPendientesForMonth({
      db,
      householdId,
      ...currentMonthRange(SEPTEMBER),
    })
    const october = await listPendientesForMonth({
      db,
      householdId,
      ...currentMonthRange(OCTOBER),
    })

    expect(settledNames(september)).toEqual(['Seguro vivienda'])
    expect(settledNames(october)).toEqual([])
  })

  it('keeps a bill paid late in the month it was due', async () => {
    const { db, householdId, categoryId } = await household()
    const septemberBill = await createPendiente({
      db,
      householdId,
      categoryId,
      name: 'Expensas',
      dueDate: new Date(2026, 7, 28),
      expectedAmount: 88000,
      recurring: false,
    })

    await markPendientePaid({
      db,
      householdId,
      pendienteId: septemberBill.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 88000,
      // Four days into the next month.
      paymentDate: new Date(2026, 8, 3),
    })

    const august = await listPendientesForMonth({
      db,
      householdId,
      ...currentMonthRange(AUGUST),
    })
    const september = await listPendientesForMonth({
      db,
      householdId,
      ...currentMonthRange(SEPTEMBER),
    })

    expect(settledNames(august)).toContain('Expensas')
    expect(settledNames(september)).not.toContain('Expensas')
  })
})
