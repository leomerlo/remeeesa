import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import type { HouseholdsDb } from '@/lib/households'
import { createSandbox } from './sandbox'
import type { Sandbox } from './sandbox'
import {
  SANDBOX_CLASSIFIED,
  SANDBOX_REFUSED,
  SandboxGuardError,
  SandboxNotMineError,
  sandboxDb,
} from './sandboxDb'

// The household as it already is: written with the raw adapter, exactly the
// way the real one was written by the v1 long before the beta existed. Every
// test below then goes at it through the guard.
const USER = 'flor'
const TODAY = new Date(2026, 10, 7, 12)

async function setUp(): Promise<{
  readonly base: ReturnType<typeof createMemoryHouseholdsDb>
  readonly raw: HouseholdsDb
  readonly db: HouseholdsDb
  readonly sandbox: Sandbox
  readonly householdId: string
  readonly categoryId: string
  readonly expenseId: string
  readonly billId: string
  readonly cardId: string
}> {
  const base = createMemoryHouseholdsDb()
  const raw = base.asUser(USER)
  const { household } = await raw.createHouseholdAndMembership({
    userId: USER,
    name: 'Casa Merlo',
    monthlyBudget: 900_000,
    displayName: 'Flor',
  })
  const category = await raw.findOrCreateCategory({
    householdId: household.id,
    name: 'Super',
  })
  const expense = await raw.createExpense({
    householdId: household.id,
    categoryId: category.id,
    memberId: USER,
    authorDisplayName: 'Flor',
    name: 'Compra grande',
    price: 120_000,
    comments: '',
    expenseDate: TODAY,
  })
  const bill = await raw.createPendiente({
    householdId: household.id,
    categoryId: category.id,
    name: 'Luz',
    dueDate: TODAY,
    expectedAmount: 36_800,
  })
  const card = await raw.createCard({
    householdId: household.id,
    name: 'Visa',
    kind: 'credito',
    currency: 'ARS',
    brand: 'visa',
  })
  const sandbox = createSandbox(null)
  return {
    base,
    raw,
    db: sandboxDb(raw, sandbox),
    sandbox,
    householdId: household.id,
    categoryId: category.id,
    expenseId: expense.id,
    billId: bill.id,
    cardId: card.id,
  }
}

describe('what the beta is allowed to write', () => {
  let env: Awaited<ReturnType<typeof setUp>>

  beforeEach(async () => {
    env = await setUp()
  })

  it('reads everything, the way it always could', async () => {
    const expenses = await env.db.listExpensesInMonth({
      householdId: env.householdId,
      monthStart: new Date(2026, 10, 1),
      monthEnd: new Date(2026, 10, 30, 23, 59, 59),
    })
    expect(expenses).toHaveLength(1)
    expect((await env.db.getHousehold(env.householdId)).name).toBe('Casa Merlo')
  })

  // The whole point of the file. These four are the household's own data.
  it('refuses to change a gasto that was already there, and leaves it alone', async () => {
    await expect(
      env.db.updateExpense({
        householdId: env.householdId,
        expenseId: env.expenseId,
        categoryId: env.categoryId,
        name: 'Otra cosa',
        price: 1,
        comments: '',
        expenseDate: TODAY,
        memberId: USER,
        authorDisplayName: 'Flor',
        isService: false,
        currency: 'ARS',
        paymentMethodId: null,
      }),
    ).rejects.toBeInstanceOf(SandboxNotMineError)

    const still = await env.raw.getExpense({
      householdId: env.householdId,
      expenseId: env.expenseId,
    })
    expect(still?.name).toBe('Compra grande')
    expect(still?.price).toBe(120_000)
  })

  it('refuses to delete a gasto that was already there', async () => {
    await expect(
      env.db.deleteExpense({
        householdId: env.householdId,
        expenseId: env.expenseId,
      }),
    ).rejects.toBeInstanceOf(SandboxNotMineError)

    expect(
      await env.raw.getExpense({
        householdId: env.householdId,
        expenseId: env.expenseId,
      }),
    ).not.toBeNull()
  })

  it('refuses to touch a servicio, a categoría or a tarjeta that were already there', async () => {
    await expect(
      env.db.deletePendiente({
        householdId: env.householdId,
        pendienteId: env.billId,
      }),
    ).rejects.toBeInstanceOf(SandboxNotMineError)
    await expect(
      env.db.updateCategoryBudget({
        householdId: env.householdId,
        categoryId: env.categoryId,
        monthlyBudget: 1,
      }),
    ).rejects.toBeInstanceOf(SandboxNotMineError)
    await expect(
      env.db.renameCard({
        householdId: env.householdId,
        cardId: env.cardId,
        name: 'Otra',
      }),
    ).rejects.toBeInstanceOf(SandboxNotMineError)
    await expect(
      env.db.deleteCard({
        householdId: env.householdId,
        cardId: env.cardId,
      }),
    ).rejects.toBeInstanceOf(SandboxNotMineError)

    expect(
      await env.raw.getPendiente({
        householdId: env.householdId,
        pendienteId: env.billId,
      }),
    ).not.toBeNull()
    const cards = await env.raw.listCards({ householdId: env.householdId })
    expect(cards[0]?.name).toBe('Visa')
  })

  it('refuses to mark a real servicio paid, which would write a gasto against it', async () => {
    await expect(
      env.db.markPendientePaid({
        householdId: env.householdId,
        pendienteId: env.billId,
        memberId: USER,
        authorDisplayName: 'Flor',
        finalAmount: 36_800,
        paymentDate: TODAY,
      }),
    ).rejects.toBeInstanceOf(SandboxNotMineError)

    const bill = await env.raw.getPendiente({
      householdId: env.householdId,
      pendienteId: env.billId,
    })
    expect(bill?.status).toBe('pending')
  })

  it('lets it invent a gasto, then edit and delete that one', async () => {
    const made = await env.db.createExpense({
      householdId: env.householdId,
      categoryId: env.categoryId,
      memberId: USER,
      authorDisplayName: 'Flor',
      name: 'Prueba',
      price: 1_000,
      comments: '',
      expenseDate: TODAY,
    })
    expect(env.sandbox.owns('expense', made.id)).toBe(true)

    await env.db.updateExpense({
      householdId: env.householdId,
      expenseId: made.id,
      categoryId: env.categoryId,
      name: 'Prueba editada',
      price: 2_000,
      comments: '',
      expenseDate: TODAY,
      memberId: USER,
      authorDisplayName: 'Flor',
      isService: false,
      currency: 'ARS',
      paymentMethodId: null,
    })
    expect(
      (
        await env.raw.getExpense({
          householdId: env.householdId,
          expenseId: made.id,
        })
      )?.name,
    ).toBe('Prueba editada')

    await env.db.deleteExpense({
      householdId: env.householdId,
      expenseId: made.id,
    })
    expect(
      await env.raw.getExpense({
        householdId: env.householdId,
        expenseId: made.id,
      }),
    ).toBeNull()
    // Deleted means no longer held, so the cleanup does not chase it.
    expect(env.sandbox.owns('expense', made.id)).toBe(false)
  })

  it('lets it pay a servicio it invented, and owns the gasto that pays it', async () => {
    const bill = await env.db.createPendiente({
      householdId: env.householdId,
      categoryId: env.categoryId,
      name: 'Luz de prueba',
      dueDate: TODAY,
      expectedAmount: 1_000,
    })
    const { expense } = await env.db.markPendientePaid({
      householdId: env.householdId,
      pendienteId: bill.id,
      memberId: USER,
      authorDisplayName: 'Flor',
      finalAmount: 1_100,
      paymentDate: TODAY,
    })

    // Otherwise paying a test bill would leave a gasto behind that nothing
    // could remove.
    expect(env.sandbox.owns('expense', expense.id)).toBe(true)
  })

  it('will not put a consumo on a real card, because that writes into its resumen', async () => {
    await expect(
      env.db.createCardPurchase({
        householdId: env.householdId,
        cardId: env.cardId,
        categoryId: env.categoryId,
        resumenCategoryId: env.categoryId,
        memberId: USER,
        authorDisplayName: 'Flor',
        name: 'Prueba',
        total: 10_000,
        cuotas: 3,
        purchaseDate: TODAY,
        comments: '',
        currency: 'ARS',
      }),
    ).rejects.toBeInstanceOf(SandboxNotMineError)

    const purchases = await env.raw.listCardPurchasesInMonth({
      householdId: env.householdId,
      monthStart: new Date(2026, 10, 1),
      monthEnd: new Date(2026, 10, 30, 23, 59, 59),
    })
    expect(purchases).toHaveLength(0)
  })

  it('will put one on a card it created itself, and owns every resumen it opens', async () => {
    const card = await env.db.createCard({
      householdId: env.householdId,
      name: 'Tarjeta de prueba',
      kind: 'credito',
      currency: 'ARS',
      brand: 'otra',
    })
    const purchase = await env.db.createCardPurchase({
      householdId: env.householdId,
      cardId: card.id,
      categoryId: env.categoryId,
      resumenCategoryId: env.categoryId,
      memberId: USER,
      authorDisplayName: 'Flor',
      name: 'Prueba en cuotas',
      total: 30_000,
      cuotas: 3,
      purchaseDate: TODAY,
      comments: '',
      currency: 'ARS',
    })

    expect(env.sandbox.owns('purchase', purchase.id)).toBe(true)
    // Three cuotas, three statements -- all three claimed, or the cleanup
    // would leave bills in December, January and February.
    const resumenes = (
      await env.raw.listPendientes({ householdId: env.householdId })
    ).filter((bill) => bill.cardId === card.id)
    expect(resumenes).toHaveLength(3)
    for (const resumen of resumenes) {
      expect(env.sandbox.owns('pendiente', resumen.id)).toBe(true)
    }
    // And it can take the whole thing back out again, which is the half of
    // the rule that says the household ends up as it started.
    await env.db.deleteCardPurchase({
      householdId: env.householdId,
      purchaseId: purchase.id,
    })
    await env.db.deleteCard({ householdId: env.householdId, cardId: card.id })
    expect(
      (await env.raw.listCards({ householdId: env.householdId })).map(
        (one) => one.name,
      ),
    ).toEqual(['Visa'])
  })

  it('claims a category it creates, and never one that was already there', async () => {
    const existing = await env.db.findOrCreateCategory({
      householdId: env.householdId,
      name: 'Super',
    })
    expect(existing.id).toBe(env.categoryId)
    expect(env.sandbox.owns('category', existing.id)).toBe(false)

    const fresh = await env.db.findOrCreateCategory({
      householdId: env.householdId,
      name: 'Mascotas',
    })
    expect(env.sandbox.owns('category', fresh.id)).toBe(true)
  })

  it('moves what it owns when a category of its own is renamed', async () => {
    const made = await env.db.findOrCreateCategory({
      householdId: env.householdId,
      name: 'Mascotas',
    })
    const renamed = await env.db.renameCategory({
      householdId: env.householdId,
      categoryId: made.id,
      name: 'Perro',
    })

    expect(env.sandbox.owns('category', renamed.id)).toBe(true)
    expect(env.sandbox.owns('category', made.id)).toBe(false)
  })

  it('will not rename or re-budget the house it found, however it is asked', async () => {
    for (const call of [
      () =>
        env.db.updateHousehold({
          householdId: env.householdId,
          name: 'Otro nombre',
          monthlyBudget: 1,
          monthlyBudgets: {},
        }),
      () =>
        env.db.updateMonthlyBudget({
          householdId: env.householdId,
          monthlyBudget: 1,
          monthlyBudgets: {},
        }),
      () => env.db.leaveHousehold({ userId: USER }),
      () =>
        env.db.updateMemberDisplayName({
          householdId: env.householdId,
          userId: USER,
          displayName: 'Otra',
        }),
    ]) {
      await expect(call()).rejects.toThrow(SandboxNotMineError)
    }

    const household = await env.raw.getHousehold(env.householdId)
    expect(household.name).toBe('Casa Merlo')
    expect(household.monthlyBudget).toBe(900_000)
    const members = await env.raw.listMembers(env.householdId)
    expect(members).toHaveLength(1)
  })

  // The invite is the one write onto the real household document that Flor
  // allowed out loud, and it is the mildest one there is: the same code
  // comes back every time it is asked for.
  it('hands out the invite code for the real household', async () => {
    const invite = await env.db.getOrCreateInvite({
      householdId: env.householdId,
    })
    expect(invite.householdId).toBe(env.householdId)
    expect(invite.token.length).toBeGreaterThan(0)

    const again = await env.db.getOrCreateInvite({
      householdId: env.householdId,
    })
    expect(again.token).toBe(invite.token)
  })

  // Setting up a new house is what the onboarding does, and the house that
  // comes out of it is the beta's own: it may be named and re-budgeted,
  // while the house next door may not.
  it('owns a house it sets up, and can put a budget on that one', async () => {
    const asSuegro = sandboxDb(env.base.asUser('suegro'), env.sandbox)
    const made = await asSuegro.createHouseholdAndMembership({
      userId: 'suegro',
      name: 'Casa nueva',
      monthlyBudget: 0,
      displayName: 'Jorge',
    })
    expect(env.sandbox.owns('household', made.household.id)).toBe(true)
    expect(env.sandbox.owns('membership', 'suegro')).toBe(true)

    await asSuegro.updateMonthlyBudget({
      householdId: made.household.id,
      monthlyBudget: 400_000,
      monthlyBudgets: { '2026-11': 400_000 },
    })
    const after = await env.base
      .asUser('suegro')
      .getHousehold(made.household.id)
    expect(after.monthlyBudget).toBe(400_000)

    // And the house it did not make is still shut.
    await expect(
      env.db.updateMonthlyBudget({
        householdId: env.householdId,
        monthlyBudget: 1,
        monthlyBudgets: {},
      }),
    ).rejects.toThrow(SandboxNotMineError)
  })

  // Walking in with a code writes one member document, and only the
  // membership it wrote can be walked back out of.
  it('owns the membership it joins with, and no other', async () => {
    const invite = await env.db.getOrCreateInvite({
      householdId: env.householdId,
    })
    const asLeo = sandboxDb(env.base.asUser('leo'), env.sandbox)
    const member = await asLeo.joinHousehold({
      userId: 'leo',
      token: invite.token,
      displayName: 'Leo',
    })
    expect(member.householdId).toBe(env.householdId)
    expect(env.sandbox.owns('membership', 'leo')).toBe(true)

    await asLeo.leaveHousehold({ userId: 'leo' })
    expect(env.sandbox.owns('membership', 'leo')).toBe(false)
    // Flor's own membership was never the beta's to leave.
    await expect(env.db.leaveHousehold({ userId: USER })).rejects.toThrow(
      SandboxNotMineError,
    )
  })

  it('still refuses a merge, which rewrites rows it does not own', () => {
    expect(() =>
      env.db.mergeCategories({
        householdId: env.householdId,
        sourceCategoryId: env.categoryId,
        survivorCategoryId: env.categoryId,
      }),
    ).toThrow(SandboxGuardError)
  })

  it('blocks any method nobody has classified, rather than guessing from its name', () => {
    const guarded = sandboxDb(
      {
        ...env.raw,
        // Stands in for a method added to HouseholdsDb after this guard was
        // written: it must stay shut until somebody decides what it is.
        somethingNew: () => Promise.resolve(),
      } as unknown as HouseholdsDb,
      env.sandbox,
    ) as unknown as Record<string, () => unknown>

    expect(() => guarded['somethingNew']?.()).toThrow(SandboxGuardError)
  })
})

// The failure this catches really happened while the guard was being
// written: deleteCard was in neither list, so the cleanup could not take a
// test card back out, and the only symptom was one row that would not go.
describe('every method of the database has been thought about', () => {
  it('is either classified or refused, with nothing in between', () => {
    const raw = createMemoryHouseholdsDb().asUser(USER) as unknown as Record<
      string,
      unknown
    >
    const known = new Set([...SANDBOX_CLASSIFIED, ...SANDBOX_REFUSED])
    const methods = Object.keys(raw).filter(
      (key) => typeof raw[key] === 'function',
    )

    expect(methods.length).toBeGreaterThan(30)
    expect(methods.filter((method) => !known.has(method))).toEqual([])
  })

  it('refuses the ones on the refused list, every time', async () => {
    const env = await setUp()
    for (const method of SANDBOX_REFUSED) {
      const call = (
        env.db as unknown as Record<string, (arg: unknown) => unknown>
      )[method]
      expect(() => call?.({ householdId: env.householdId })).toThrow(
        SandboxGuardError,
      )
    }
  })
})
