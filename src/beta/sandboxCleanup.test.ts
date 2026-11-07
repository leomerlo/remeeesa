import { describe, expect, it } from 'vitest'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { createSandbox } from './sandbox'
import { cleanSandbox } from './sandboxCleanup'
import { sandboxDb } from './sandboxDb'

const USER = 'flor'
const TODAY = new Date(2026, 10, 7, 12)
const MONTH = {
  monthStart: new Date(2026, 10, 1),
  monthEnd: new Date(2026, 10, 30, 23, 59, 59),
}

// The household as it stands, plus a session of the beta writing test rows
// into it -- then the cleanup, and the question that matters: is the
// household exactly as it was?
describe('taking the test data back out', () => {
  it('removes everything the beta wrote and nothing else', async () => {
    const raw = createMemoryHouseholdsDb().asUser(USER)
    const { household } = await raw.createHouseholdAndMembership({
      userId: USER,
      name: 'Casa Merlo',
      monthlyBudget: 900_000,
      displayName: 'Flor',
    })
    const householdId = household.id
    const real = await raw.findOrCreateCategory({ householdId, name: 'Super' })
    const realExpense = await raw.createExpense({
      householdId,
      categoryId: real.id,
      memberId: USER,
      authorDisplayName: 'Flor',
      name: 'Compra grande',
      price: 120_000,
      comments: '',
      expenseDate: TODAY,
    })
    const realBill = await raw.createPendiente({
      householdId,
      categoryId: real.id,
      name: 'Luz',
      dueDate: TODAY,
      expectedAmount: 36_800,
    })
    const realCard = await raw.createCard({
      householdId,
      name: 'Visa',
      kind: 'credito',
      currency: 'ARS',
      brand: 'visa',
    })

    const sandbox = createSandbox(null)
    const db = sandboxDb(raw, sandbox)

    // A full afternoon of trying the forms out.
    const testCategory = await db.findOrCreateCategory({
      householdId,
      name: 'Mascotas',
    })
    const testExpense = await db.createExpense({
      householdId,
      categoryId: testCategory.id,
      memberId: USER,
      authorDisplayName: 'Flor',
      name: 'Gasto de prueba',
      price: 5_000,
      comments: '',
      expenseDate: TODAY,
    })
    const testBill = await db.createPendiente({
      householdId,
      categoryId: testCategory.id,
      name: 'Servicio de prueba',
      dueDate: TODAY,
      expectedAmount: 2_000,
    })
    const testCard = await db.createCard({
      householdId,
      name: 'Tarjeta de prueba',
      kind: 'credito',
      currency: 'ARS',
      brand: 'otra',
    })
    const testPurchase = await db.createCardPurchase({
      householdId,
      cardId: testCard.id,
      categoryId: testCategory.id,
      resumenCategoryId: real.id,
      memberId: USER,
      authorDisplayName: 'Flor',
      name: 'Consumo de prueba',
      total: 9_000,
      cuotas: 3,
      purchaseDate: TODAY,
      comments: '',
      currency: 'ARS',
    })

    const result = await cleanSandbox({ db, sandbox, householdId })

    expect(result.left).toBe(0)
    expect(sandbox.size()).toBe(0)

    // Gone: every row the beta wrote, the three statements its purchase
    // opened included.
    expect(
      await raw.getExpense({ householdId, expenseId: testExpense.id }),
    ).toBeNull()
    expect(
      await raw.getPendiente({ householdId, pendienteId: testBill.id }),
    ).toBeNull()
    expect(
      await raw.getCardPurchases({
        householdId,
        purchaseIds: [testPurchase.id],
      }),
    ).toHaveLength(0)
    const cards = await raw.listCards({ householdId })
    expect(cards.map((card) => card.name)).toEqual(['Visa'])
    const categories = await raw.listCategories(householdId)
    expect(categories.some((one) => one.id === testCategory.id)).toBe(false)

    // Still there: the household's own.
    const household2 = await raw.getHousehold(householdId)
    expect(household2.name).toBe('Casa Merlo')
    expect(household2.monthlyBudget).toBe(900_000)
    const kept = await raw.getExpense({
      householdId,
      expenseId: realExpense.id,
    })
    expect(kept?.price).toBe(120_000)
    expect(
      await raw.getPendiente({ householdId, pendienteId: realBill.id }),
    ).not.toBeNull()
    expect(cards[0]?.id).toBe(realCard.id)
    expect(categories.some((one) => one.id === real.id)).toBe(true)
    // And the month reads exactly what it read before the beta touched it.
    const month = await raw.listExpensesInMonth({ householdId, ...MONTH })
    expect(month.map((one) => one.name)).toEqual(['Compra grande'])
  })

  it('counts a row it cannot remove instead of saying it is done', async () => {
    const raw = createMemoryHouseholdsDb().asUser(USER)
    const { household } = await raw.createHouseholdAndMembership({
      userId: USER,
      name: 'Casa Merlo',
      monthlyBudget: 500_000,
      displayName: 'Flor',
    })
    const householdId = household.id
    const sandbox = createSandbox(null)
    const db = sandboxDb(raw, sandbox)

    const testCategory = await db.findOrCreateCategory({
      householdId,
      name: 'Mascotas',
    })
    // Somebody put a real gasto into the test category from the v1, so the
    // category can no longer be deleted -- the v1 refuses to orphan it.
    await raw.createExpense({
      householdId,
      categoryId: testCategory.id,
      memberId: USER,
      authorDisplayName: 'Leo',
      name: 'Alimento del perro',
      price: 30_000,
      comments: '',
      expenseDate: TODAY,
    })

    const result = await cleanSandbox({ db, sandbox, householdId })

    expect(result.left).toBe(1)
    expect(sandbox.owns('category', testCategory.id)).toBe(true)
    const categories = await raw.listCategories(householdId)
    expect(categories.some((one) => one.id === testCategory.id)).toBe(true)
  })

  it('treats a row that is already gone as done', async () => {
    const raw = createMemoryHouseholdsDb().asUser(USER)
    const { household } = await raw.createHouseholdAndMembership({
      userId: USER,
      name: 'Casa Merlo',
      monthlyBudget: 500_000,
      displayName: 'Flor',
    })
    const sandbox = createSandbox(null)
    sandbox.claim('expense', 'gasto-que-ya-no-esta')

    const result = await cleanSandbox({
      db: sandboxDb(raw, sandbox),
      sandbox,
      householdId: household.id,
    })

    expect(result).toEqual({ removed: 1, left: 0 })
    expect(sandbox.size()).toBe(0)
  })
})
