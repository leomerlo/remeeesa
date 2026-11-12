import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  Timestamp,
} from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { CARD_BRANDS, PAYMENT_METHOD_KINDS } from '@/lib/cards'

// firestore.rules, actually executed.
//
// The rest of this project reads the rules file as text and asserts that it
// contains the right clauses. That catches a lot, but it cannot catch a
// rule that is written correctly and still forbids what the app writes --
// which is exactly how two bugs reached production in one day: the card
// edit form writes name, brand and currency together while the update rule
// allowed only two of them, and deleting a card had no rule at all. Both
// passed every test, because every other test runs against the in-memory
// adapter, which has no rules.
//
// So these tests write the documents the app writes, as the user the app
// signs in, and assert that Firestore itself says yes -- and that it says
// no to the things the rules exist to prevent.

const PROJECT_ID = 'remeeesa-rules'
const ME = 'user-1'
const OUTSIDER = 'user-2'
const HOUSEHOLD = 'household-1'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

// Every test starts from the same household with one member, written with
// the rules off -- this is fixture setup, not something under test.
beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'households', HOUSEHOLD), {
      name: 'Casa',
      monthly_budget: 1000,
      created_at: Timestamp.now(),
    })
    await setDoc(doc(db, 'household_members', ME), {
      household_id: HOUSEHOLD,
      display_name: 'Ada',
      joined_at: Timestamp.now(),
    })
    // The rules look a category up before letting an expense or a bill
    // name it -- `get(categories/$(category_id)).data.household_id` -- so a
    // fixture without one makes the rule throw rather than refuse. Found by
    // running them: the text-reading tests could never have shown this.
    for (const id of ['cat-1', 'cat-tarjeta']) {
      await setDoc(doc(db, 'categories', id), {
        household_id: HOUSEHOLD,
        name: id,
        color: '#4e4c56',
        monthly_budget: 0,
        created_at: Timestamp.now(),
      })
    }
  })
})

function asMember(): Firestore {
  return testEnv.authenticatedContext(ME).firestore() as unknown as Firestore
}

function asOutsider(): Firestore {
  return testEnv
    .authenticatedContext(OUTSIDER)
    .firestore() as unknown as Firestore
}

// What the app writes when a card is created, field for field.
function cardDocument(overrides: Record<string, unknown> = {}) {
  return {
    household_id: HOUSEHOLD,
    name: 'Visa',
    kind: 'credito',
    currency: 'ARS',
    brand: 'visa',
    created_at: Timestamp.now(),
    ...overrides,
  }
}

describe('cards', () => {
  it('lets a member create one', async () => {
    await assertSucceeds(
      setDoc(doc(asMember(), 'cards', 'card-1'), cardDocument()),
    )
  })

  it('refuses one for a household you are not in', async () => {
    await assertFails(
      setDoc(doc(asOutsider(), 'cards', 'card-1'), cardDocument()),
    )
  })

  // The first of the two production bugs: the edit form writes all three in
  // one go, and the rule allowed only name and currency.
  it('lets the edit form save the name, the kind, the brand and the currency together', async () => {
    const db = asMember()
    await setDoc(doc(db, 'cards', 'card-1'), cardDocument())

    await assertSucceeds(
      updateDoc(doc(db, 'cards', 'card-1'), {
        name: 'Visa Gold',
        kind: 'debito',
        brand: 'mastercard',
        currency: 'BOTH',
      }),
    )
  })

  // The second: deleting one is a real action in Ajustes and had no rule.
  it('lets a member delete one, and an outsider not', async () => {
    const db = asMember()
    await setDoc(doc(db, 'cards', 'card-1'), cardDocument())

    await assertFails(deleteDoc(doc(asOutsider(), 'cards', 'card-1')))
    await assertSucceeds(deleteDoc(doc(db, 'cards', 'card-1')))
  })

  // Every method the form can actually build, executed. 'mercadopago' was
  // in the app's brand list and not in the rules', so adding a Mercado
  // Pago account was refused in production -- the whole point of running
  // these against a real Firestore rather than reading the file.
  it.each(
    CARD_BRANDS.flatMap((brand) =>
      PAYMENT_METHOD_KINDS.map((kind) => [brand.value, kind.value] as const),
    ),
  )('accepts a %s card of kind %s', async (brand, kind) => {
    await assertSucceeds(
      setDoc(
        doc(asMember(), 'cards', `card-${brand}-${kind}`),
        cardDocument({ brand, kind }),
      ),
    )
  })

  it('refuses a blank name and an unknown kind', async () => {
    const db = asMember()

    await assertFails(
      setDoc(doc(db, 'cards', 'card-blank'), cardDocument({ name: '   ' })),
    )
    await assertFails(
      setDoc(doc(db, 'cards', 'card-kind'), cardDocument({ kind: 'cripto' })),
    )
  })
})

describe('a ceiling in dollars on a category', () => {
  function categoryDocument(overrides: Record<string, unknown> = {}) {
    return {
      household_id: HOUSEHOLD,
      name: 'Meta Ads',
      color: '#4e4c56',
      monthly_budget: 0,
      created_at: Timestamp.now(),
      ...overrides,
    }
  }

  it('lets a category be created with one', async () => {
    await assertSucceeds(
      setDoc(
        doc(asMember(), 'categories', 'cat-ads'),
        categoryDocument({ monthly_budget_usd: 500 }),
      ),
    )
  })

  it('lets it be set and cleared afterwards', async () => {
    const db = asMember()
    await setDoc(doc(db, 'categories', 'cat-ads'), categoryDocument())

    await assertSucceeds(
      updateDoc(doc(db, 'categories', 'cat-ads'), {
        monthly_budget_usd: 500,
      }),
    )
    await assertSucceeds(
      updateDoc(doc(db, 'categories', 'cat-ads'), { monthly_budget_usd: 0 }),
    )
  })

  it('refuses a ceiling that is not a number of zero or more', async () => {
    const db = asMember()
    await setDoc(doc(db, 'categories', 'cat-ads'), categoryDocument())

    await assertFails(
      updateDoc(doc(db, 'categories', 'cat-ads'), { monthly_budget_usd: -1 }),
    )
    await assertFails(
      updateDoc(doc(db, 'categories', 'cat-ads'), {
        monthly_budget_usd: 'mucho',
      }),
    )
  })

  it('refuses it to somebody outside the household', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'categories', 'cat-ads'),
        categoryDocument(),
      )
    })

    await assertFails(
      updateDoc(doc(asOutsider(), 'categories', 'cat-ads'), {
        monthly_budget_usd: 500,
      }),
    )
  })
})

describe('expenses', () => {
  function expenseDocument(overrides: Record<string, unknown> = {}) {
    return {
      household_id: HOUSEHOLD,
      category_id: 'cat-1',
      member_id: ME,
      author_display_name: 'Ada',
      name: 'Pizza',
      price: 1000,
      comments: '',
      expense_date: Timestamp.now(),
      pendiente_id: null,
      is_service: false,
      subcategory: null,
      currency: 'ARS',
      payment_method_id: null,
      created_at: Timestamp.now(),
      ...overrides,
    }
  }

  it('lets a member log one, with the payment method on it', async () => {
    await assertSucceeds(
      setDoc(
        doc(asMember(), 'expenses', 'expense-1'),
        expenseDocument({ payment_method_id: 'card-1' }),
      ),
    )
  })

  it('refuses one for another household', async () => {
    await assertFails(
      setDoc(doc(asOutsider(), 'expenses', 'expense-1'), expenseDocument()),
    )
  })

  // Both are chosen at the moment a gasto is logged, which is when they
  // are easiest to get wrong. Before this the only fix was deleting the
  // gasto and adding it again. Per direct feedback.
  it('lets the currency and the payment method be corrected afterwards', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'cards', 'card-1'), cardDocument())
    })
    const db = asMember()
    await setDoc(doc(db, 'expenses', 'expense-1'), expenseDocument())

    await assertSucceeds(
      updateDoc(doc(db, 'expenses', 'expense-1'), {
        currency: 'USD',
        payment_method_id: 'card-1',
      }),
    )
    // Back to cash, which is what null has always meant here.
    await assertSucceeds(
      updateDoc(doc(db, 'expenses', 'expense-1'), {
        payment_method_id: null,
      }),
    )
  })

  it('refuses a payment method that belongs to another household', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'cards', 'card-elsewhere'),
        cardDocument({ household_id: 'household-2' }),
      )
    })
    const db = asMember()
    await setDoc(doc(db, 'expenses', 'expense-1'), expenseDocument())

    await assertFails(
      updateDoc(doc(db, 'expenses', 'expense-1'), {
        payment_method_id: 'card-elsewhere',
      }),
    )
    await assertFails(
      updateDoc(doc(db, 'expenses', 'expense-1'), {
        payment_method_id: 'card-that-does-not-exist',
      }),
    )
  })

  it('refuses a currency it does not know, on update too', async () => {
    const db = asMember()
    await setDoc(doc(db, 'expenses', 'expense-1'), expenseDocument())

    await assertFails(
      updateDoc(doc(db, 'expenses', 'expense-1'), { currency: 'EUR' }),
    )
  })

  it('refuses a price of zero and an unknown currency', async () => {
    const db = asMember()

    await assertFails(
      setDoc(
        doc(db, 'expenses', 'expense-zero'),
        expenseDocument({ price: 0 }),
      ),
    )
    await assertFails(
      setDoc(
        doc(db, 'expenses', 'expense-eur'),
        expenseDocument({ currency: 'EUR' }),
      ),
    )
  })
})

// Recurrence outlives the payment: whether a bill comes back next month is
// a question about next month, so it stays editable from the gasto's own
// edit form even after the bill is paid. Everything else on a paid
// Pendiente stays frozen.
// A bill can be in dollars, and like a gasto's, its currency is
// correctable -- it is picked when the bill is written down, which is when
// it is easiest to get wrong. Per direct feedback.
describe('a bill in dollars', () => {
  const PENDIENTE = 'pendiente-usd'

  async function seedBill(currency?: string): Promise<void> {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'pendientes', PENDIENTE), {
        household_id: HOUSEHOLD,
        category_id: 'cat-1',
        name: 'Skool',
        due_date: Timestamp.fromDate(new Date(2026, 9, 10)),
        expected_amount: 97,
        recurring: true,
        auto_debit: false,
        status: 'pending',
        paid_expense_id: null,
        paid_at: null,
        created_at: Timestamp.now(),
        ...(currency === undefined ? {} : { currency }),
      })
    })
  }

  it('is created in dollars', async () => {
    await assertSucceeds(
      setDoc(doc(asMember(), 'pendientes', PENDIENTE), {
        household_id: HOUSEHOLD,
        category_id: 'cat-1',
        name: 'Skool',
        due_date: Timestamp.fromDate(new Date(2026, 9, 10)),
        expected_amount: 97,
        recurring: true,
        auto_debit: false,
        status: 'pending',
        currency: 'USD',
        paid_expense_id: null,
        paid_at: null,
        created_at: Timestamp.now(),
      }),
    )
  })

  it('lets a pending bill be moved to the other currency', async () => {
    await seedBill()

    await assertSucceeds(
      updateDoc(doc(asMember(), 'pendientes', PENDIENTE), {
        currency: 'USD',
      }),
    )
  })

  it('refuses a currency it does not know', async () => {
    await seedBill('USD')

    await assertFails(
      updateDoc(doc(asMember(), 'pendientes', PENDIENTE), {
        currency: 'EUR',
      }),
    )
  })
})

// What a bill is normally paid with -- the card the bank debits it from,
// above all. A servicio on débito automático has an answer to this that
// nobody is there to give at the moment it is taken, which is the whole
// reason the field exists.
describe('the method a bill is paid with', () => {
  const PENDIENTE = 'pendiente-edenor'

  async function seedBill(paymentMethodId?: string | null): Promise<void> {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'pendientes', PENDIENTE), {
        household_id: HOUSEHOLD,
        category_id: 'cat-1',
        name: 'Edenor',
        due_date: Timestamp.fromDate(new Date(2026, 9, 10)),
        expected_amount: 36_800,
        recurring: true,
        auto_debit: true,
        status: 'pending',
        paid_expense_id: null,
        paid_at: null,
        created_at: Timestamp.now(),
        ...(paymentMethodId === undefined
          ? {}
          : { payment_method_id: paymentMethodId }),
      })
    })
  }

  it('is written when the bill is created', async () => {
    await assertSucceeds(
      setDoc(doc(asMember(), 'pendientes', PENDIENTE), {
        household_id: HOUSEHOLD,
        category_id: 'cat-1',
        name: 'Edenor',
        due_date: Timestamp.fromDate(new Date(2026, 9, 10)),
        expected_amount: 36_800,
        recurring: true,
        auto_debit: true,
        payment_method_id: 'card-1',
        status: 'pending',
        paid_expense_id: null,
        paid_at: null,
        created_at: Timestamp.now(),
      }),
    )
  })

  it('can be changed on a bill that is still pending', async () => {
    await seedBill(null)

    await assertSucceeds(
      updateDoc(doc(asMember(), 'pendientes', PENDIENTE), {
        payment_method_id: 'card-1',
      }),
    )
  })

  // Back to cash, which is what null means here.
  it('can be cleared', async () => {
    await seedBill('card-1')

    await assertSucceeds(
      updateDoc(doc(asMember(), 'pendientes', PENDIENTE), {
        payment_method_id: null,
      }),
    )
  })

  it('refuses anything that is not a card id', async () => {
    await seedBill(null)

    await assertFails(
      updateDoc(doc(asMember(), 'pendientes', PENDIENTE), {
        payment_method_id: 7,
      }),
    )
  })
})

// Paying a bill with a credit card: nothing leaves the household today, so
// there is no Expense to point at. The bill links to the CardPurchase the
// payment created instead, and the two are written in the same commit --
// which is the only reason the rules can check the purchase is real.
describe('paying a bill with a credit card', () => {
  const PENDIENTE = 'pendiente-1'
  const PURCHASE = 'purchase-1'

  async function seedPendingBill(): Promise<void> {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'cards', 'card-1'), cardDocument())
      await setDoc(doc(db, 'pendientes', PENDIENTE), {
        household_id: HOUSEHOLD,
        category_id: 'cat-1',
        name: 'Luz',
        due_date: Timestamp.fromDate(new Date(2026, 9, 10)),
        expected_amount: 36800,
        recurring: true,
        auto_debit: false,
        status: 'pending',
        paid_expense_id: null,
        paid_at: null,
        created_at: Timestamp.now(),
      })
    })
  }

  function purchaseDocument(overrides: Record<string, unknown> = {}) {
    return {
      household_id: HOUSEHOLD,
      card_id: 'card-1',
      category_id: 'cat-1',
      member_id: ME,
      author_display_name: 'Ada',
      name: 'Luz',
      total: 36800,
      cuotas: 1,
      purchase_date: Timestamp.now(),
      comments: '',
      currency: 'ARS',
      created_at: Timestamp.now(),
      ...overrides,
    }
  }

  it('links the bill to the purchase written in the same commit', async () => {
    await seedPendingBill()
    const db = asMember()
    const batch = writeBatch(db)
    batch.set(doc(db, 'card_purchases', PURCHASE), purchaseDocument())
    batch.update(doc(db, 'pendientes', PENDIENTE), {
      status: 'paid',
      paid_purchase_id: PURCHASE,
      paid_at: Timestamp.now(),
    })

    await assertSucceeds(batch.commit())
  })

  // Without this a member could mark any bill paid by naming an id that
  // does not exist, and the money would simply never show up anywhere.
  it('refuses a purchase id that no commit creates', async () => {
    await seedPendingBill()
    const db = asMember()

    await assertFails(
      updateDoc(doc(db, 'pendientes', PENDIENTE), {
        status: 'paid',
        paid_purchase_id: 'invented',
        paid_at: Timestamp.now(),
      }),
    )
  })

  it('refuses a purchase belonging to another household', async () => {
    await seedPendingBill()
    const db = asMember()
    const batch = writeBatch(db)
    batch.set(
      doc(db, 'card_purchases', PURCHASE),
      purchaseDocument({ household_id: 'household-2' }),
    )
    batch.update(doc(db, 'pendientes', PENDIENTE), {
      status: 'paid',
      paid_purchase_id: PURCHASE,
      paid_at: Timestamp.now(),
    })

    await assertFails(batch.commit())
  })

  // Undoing it has to take the purchase with it: a consumo left in a
  // Resumen with nothing owing it is money that shows up twice.
  it('undoes the payment only when the purchase goes too', async () => {
    await seedPendingBill()
    const db = asMember()
    const first = writeBatch(db)
    first.set(doc(db, 'card_purchases', PURCHASE), purchaseDocument())
    first.update(doc(db, 'pendientes', PENDIENTE), {
      status: 'paid',
      paid_purchase_id: PURCHASE,
      paid_at: Timestamp.now(),
    })
    await first.commit()

    await assertFails(
      updateDoc(doc(db, 'pendientes', PENDIENTE), {
        status: 'pending',
        paid_purchase_id: null,
        paid_at: null,
      }),
    )

    const undo = writeBatch(db)
    undo.delete(doc(db, 'card_purchases', PURCHASE))
    undo.update(doc(db, 'pendientes', PENDIENTE), {
      status: 'pending',
      paid_purchase_id: null,
      paid_at: null,
    })
    await assertSucceeds(undo.commit())
  })

  it('refuses it on a card Resumen, which is not something you put on a card', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'cards', 'card-1'), cardDocument())
      await setDoc(doc(db, 'pendientes', 'card-1_2026-10'), {
        household_id: HOUSEHOLD,
        category_id: 'cat-tarjeta',
        name: 'Visa',
        due_date: Timestamp.fromDate(new Date(2026, 9, 10)),
        expected_amount: null,
        estimated_amount: 5000,
        recurring: false,
        auto_debit: false,
        status: 'pending',
        paid_expense_id: null,
        paid_at: null,
        created_at: Timestamp.now(),
        card_id: 'card-1',
        currency: 'ARS',
        purchase_ids: ['purchase-9'],
      })
    })
    const db = asMember()
    const batch = writeBatch(db)
    batch.set(doc(db, 'card_purchases', PURCHASE), purchaseDocument())
    batch.update(doc(db, 'pendientes', 'card-1_2026-10'), {
      status: 'paid',
      paid_purchase_id: PURCHASE,
      paid_at: Timestamp.now(),
    })

    await assertFails(batch.commit())
  })
})

describe('recurrence on a paid pendiente', () => {
  const PENDIENTE = 'pendiente-1'

  async function seedPaidPendiente(): Promise<void> {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'pendientes', PENDIENTE), {
        household_id: HOUSEHOLD,
        category_id: 'cat-1',
        name: 'Internet',
        due_date: Timestamp.fromDate(new Date(2026, 9, 10)),
        expected_amount: 5000,
        recurring: false,
        auto_debit: false,
        status: 'paid',
        paid_expense_id: 'expense-1',
        paid_at: Timestamp.now(),
        created_at: Timestamp.now(),
      })
    })
  }

  it('lets recurrence and automatic debit be set on one already paid', async () => {
    await seedPaidPendiente()

    await assertSucceeds(
      updateDoc(doc(asMember(), 'pendientes', PENDIENTE), {
        recurring: true,
        auto_debit: true,
      }),
    )
  })

  it('still refuses every other field on one already paid', async () => {
    await seedPaidPendiente()
    const db = asMember()

    await assertFails(
      updateDoc(doc(db, 'pendientes', PENDIENTE), { name: 'Otro' }),
    )
    await assertFails(
      updateDoc(doc(db, 'pendientes', PENDIENTE), { expected_amount: 9000 }),
    )
    // Not even alongside a legitimate recurrence change.
    await assertFails(
      updateDoc(doc(db, 'pendientes', PENDIENTE), {
        recurring: true,
        expected_amount: 9000,
      }),
    )
  })

  it('refuses it on a card Resumen, which does not repeat', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'cards', 'card-1'), cardDocument())
      await setDoc(doc(db, 'pendientes', 'card-1_2026-10'), {
        household_id: HOUSEHOLD,
        category_id: 'cat-tarjeta',
        name: 'Visa',
        due_date: Timestamp.fromDate(new Date(2026, 9, 10)),
        expected_amount: null,
        estimated_amount: 5000,
        recurring: false,
        auto_debit: false,
        status: 'pending',
        paid_expense_id: null,
        paid_at: null,
        created_at: Timestamp.now(),
        card_id: 'card-1',
        currency: 'ARS',
        purchase_ids: ['purchase-1'],
      })
    })

    await assertFails(
      updateDoc(doc(asMember(), 'pendientes', 'card-1_2026-10'), {
        recurring: true,
        auto_debit: true,
      }),
    )
  })
})

describe('paying part of a bill', () => {
  const PENDIENTE = 'pendiente-1'
  const GASTO = 'expense-parcial-1'

  async function seedPendingBill(
    overrides: Record<string, unknown> = {},
  ): Promise<void> {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'pendientes', PENDIENTE), {
        household_id: HOUSEHOLD,
        category_id: 'cat-1',
        name: 'Expensas',
        due_date: Timestamp.fromDate(new Date(2026, 9, 10)),
        expected_amount: 88000,
        recurring: true,
        auto_debit: false,
        status: 'pending',
        paid_expense_id: null,
        paid_at: null,
        created_at: Timestamp.now(),
        ...overrides,
      })
    })
  }

  function partialGasto(price: number, overrides: Record<string, unknown> = {}) {
    return {
      household_id: HOUSEHOLD,
      category_id: 'cat-1',
      member_id: ME,
      author_display_name: 'Ada',
      name: 'Expensas',
      price,
      comments: '',
      expense_date: Timestamp.now(),
      pendiente_id: PENDIENTE,
      is_service: true,
      subcategory: null,
      currency: 'ARS',
      payment_method_id: null,
      created_at: Timestamp.now(),
      ...overrides,
    }
  }

  // Exactly what payPendientePartially commits: the Gasto for the money
  // that left, and the bill's running total, in one transaction.
  it('writes the gasto and moves the running total in one commit', async () => {
    await seedPendingBill()
    const db = asMember()
    const batch = writeBatch(db)
    batch.set(doc(db, 'expenses', GASTO), partialGasto(50000))
    batch.update(doc(db, 'pendientes', PENDIENTE), {
      paid_so_far: 50000,
      partial_expense_ids: [GASTO],
    })

    await assertSucceeds(batch.commit())
  })

  it('adds a second payment on top of the first', async () => {
    await seedPendingBill({
      paid_so_far: 50000,
      partial_expense_ids: ['expense-parcial-0'],
    })
    const db = asMember()
    const batch = writeBatch(db)
    batch.set(doc(db, 'expenses', GASTO), partialGasto(20000))
    batch.update(doc(db, 'pendientes', PENDIENTE), {
      paid_so_far: 70000,
      partial_expense_ids: ['expense-parcial-0', GASTO],
    })

    await assertSucceeds(batch.commit())
  })

  // Without this the running total on the bill could say anything, and
  // what the month shows as owed would drift from the money in it.
  it('refuses a running total the gasto does not account for', async () => {
    await seedPendingBill()
    const db = asMember()
    const batch = writeBatch(db)
    batch.set(doc(db, 'expenses', GASTO), partialGasto(50000))
    batch.update(doc(db, 'pendientes', PENDIENTE), {
      paid_so_far: 80000,
      partial_expense_ids: [GASTO],
    })

    await assertFails(batch.commit())
  })

  it('refuses a running total with no gasto behind it at all', async () => {
    await seedPendingBill()

    await assertFails(
      updateDoc(doc(asMember(), 'pendientes', PENDIENTE), {
        paid_so_far: 50000,
        partial_expense_ids: ['invented'],
      }),
    )
  })

  // Handing over everything still owed is paying the bill, and that goes
  // through the mark-paid transition, which settles it.
  it('refuses a part that covers the whole bill', async () => {
    await seedPendingBill()
    const db = asMember()
    const batch = writeBatch(db)
    batch.set(doc(db, 'expenses', GASTO), partialGasto(88000))
    batch.update(doc(db, 'pendientes', PENDIENTE), {
      paid_so_far: 88000,
      partial_expense_ids: [GASTO],
    })

    await assertFails(batch.commit())
  })

  it('refuses it on a bill whose figure has not arrived', async () => {
    await seedPendingBill({ expected_amount: null })
    const db = asMember()
    const batch = writeBatch(db)
    batch.set(doc(db, 'expenses', GASTO), partialGasto(50000))
    batch.update(doc(db, 'pendientes', PENDIENTE), {
      paid_so_far: 50000,
      partial_expense_ids: [GASTO],
    })

    await assertFails(batch.commit())
  })

  it('refuses it to somebody outside the household', async () => {
    await seedPendingBill()
    const db = asOutsider()
    const batch = writeBatch(db)
    batch.set(doc(db, 'expenses', GASTO), partialGasto(50000))
    batch.update(doc(db, 'pendientes', PENDIENTE), {
      paid_so_far: 50000,
      partial_expense_ids: [GASTO],
    })

    await assertFails(batch.commit())
  })

  // Paying the rest afterwards is the ordinary mark-paid transition, and
  // it has to still be allowed on a bill that already has part of it in.
  it('still lets the rest be paid and the bill settled', async () => {
    await seedPendingBill({
      paid_so_far: 50000,
      partial_expense_ids: ['expense-parcial-0'],
    })
    const db = asMember()
    const batch = writeBatch(db)
    batch.set(doc(db, 'expenses', 'expense-final'), partialGasto(38000))
    batch.update(doc(db, 'pendientes', PENDIENTE), {
      status: 'paid',
      paid_expense_id: 'expense-final',
      paid_at: Timestamp.now(),
    })

    await assertSucceeds(batch.commit())
  })

  describe('undoing the last one', () => {
    async function seedPartlyPaid(): Promise<void> {
      await seedPendingBill({
        paid_so_far: 50000,
        partial_expense_ids: [GASTO],
      })
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
          doc(context.firestore(), 'expenses', GASTO),
          partialGasto(50000),
        )
      })
    }

    it('takes the gasto out and the total back down, in one commit', async () => {
      await seedPartlyPaid()
      const db = asMember()
      const batch = writeBatch(db)
      batch.delete(doc(db, 'expenses', GASTO))
      batch.update(doc(db, 'pendientes', PENDIENTE), {
        paid_so_far: 0,
        partial_expense_ids: [],
      })

      await assertSucceeds(batch.commit())
    })

    // Otherwise the gasto would stay in the month with nothing owing it,
    // which is the orphan the unmark-paid rule exists to prevent too.
    it('refuses to drop the payment while its gasto survives', async () => {
      await seedPartlyPaid()

      await assertFails(
        updateDoc(doc(asMember(), 'pendientes', PENDIENTE), {
          paid_so_far: 0,
          partial_expense_ids: [],
        }),
      )
    })

    it('refuses to raise the total while pretending to undo', async () => {
      await seedPartlyPaid()
      const db = asMember()
      const batch = writeBatch(db)
      batch.delete(doc(db, 'expenses', GASTO))
      batch.update(doc(db, 'pendientes', PENDIENTE), {
        paid_so_far: 90000,
        partial_expense_ids: [],
      })

      await assertFails(batch.commit())
    })
  })
})

describe('resúmenes', () => {
  const RESUMEN_ID = 'card-1_2026-10'

  async function seedCard(): Promise<void> {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'cards', 'card-1'), cardDocument())
    })
  }

  function resumenDocument(overrides: Record<string, unknown> = {}) {
    return {
      household_id: HOUSEHOLD,
      category_id: 'cat-tarjeta',
      name: 'Visa',
      due_date: Timestamp.fromDate(new Date(2026, 9, 10)),
      // A card bill owes nothing until it is paid: what the card charges
      // is only known through the payment itself.
      expected_amount: null,
      estimated_amount: 5000,
      recurring: false,
      auto_debit: false,
      status: 'pending',
      paid_expense_id: null,
      paid_at: null,
      created_at: Timestamp.now(),
      card_id: 'card-1',
      currency: 'ARS',
      purchase_ids: ['purchase-1'],
      ...overrides,
    }
  }

  it('is created owing nothing, with its estimate', async () => {
    await seedCard()

    await assertSucceeds(
      setDoc(doc(asMember(), 'pendientes', RESUMEN_ID), resumenDocument()),
    )
  })

  // The model the card work turned on: a purchase moves the estimate, and
  // nothing else may put a figure on a bill that has not been paid.
  it('lets a purchase move the estimate', async () => {
    await seedCard()
    const db = asMember()
    await setDoc(doc(db, 'pendientes', RESUMEN_ID), resumenDocument())

    await assertSucceeds(
      updateDoc(doc(db, 'pendientes', RESUMEN_ID), {
        estimated_amount: 7000,
        purchase_ids: ['purchase-1', 'purchase-2'],
      }),
    )
  })

  // The rule that replaced "load the statement, then pay it": a card bill
  // is an estimate until it is paid, so typing a figure into a pending one
  // is refused outright. Per direct feedback: las tarjetas siempre van a
  // ser estimadas, nunca puede ser un número fijo.
  it('refuses a figure typed into a bill that has not been paid', async () => {
    await seedCard()
    const db = asMember()
    await setDoc(doc(db, 'pendientes', RESUMEN_ID), resumenDocument())

    await assertFails(
      updateDoc(doc(db, 'pendientes', RESUMEN_ID), {
        expected_amount: 7400,
        estimated_amount: 5000,
      }),
    )
  })

  it('refuses a Resumen whose id does not match its card', async () => {
    await seedCard()

    await assertFails(
      setDoc(
        doc(asMember(), 'pendientes', 'card-9_2026-10'),
        resumenDocument(),
      ),
    )
  })

  // The write the app actually makes when a bill is paid, run against the
  // real rules: the expense it generates and the Resumen's own update land
  // in one commit, and that update is the only place expected_amount is
  // ever written.
  it('records what was paid in the commit that pays it', async () => {
    await seedCard()
    const db = asMember()
    await setDoc(doc(db, 'pendientes', RESUMEN_ID), resumenDocument())

    const batch = writeBatch(db)
    batch.set(doc(db, 'expenses', 'expense-resumen-1'), {
      household_id: HOUSEHOLD,
      category_id: 'cat-tarjeta',
      member_id: ME,
      author_display_name: 'Ada',
      name: 'Visa',
      price: 7400,
      comments: '',
      expense_date: Timestamp.now(),
      pendiente_id: RESUMEN_ID,
      is_service: false,
      subcategory: 'Comida',
      currency: 'ARS',
      payment_method_id: null,
      created_at: Timestamp.now(),
    })
    batch.update(doc(db, 'pendientes', RESUMEN_ID), {
      status: 'paid',
      // More than the estimate: the bank's taxes and interest, which is
      // why the figure is typed at the moment of paying.
      expected_amount: 7400,
      estimated_amount: 5000,
      paid_expense_id: 'expense-resumen-1',
      paid_expense_ids: ['expense-resumen-1'],
      paid_at: Timestamp.fromDate(new Date(2026, 9, 12)),
    })

    await assertSucceeds(batch.commit())
  })

  it('refuses an outsider touching the bill', async () => {
    await seedCard()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'pendientes', RESUMEN_ID),
        resumenDocument(),
      )
    })

    await assertFails(
      updateDoc(doc(asOutsider(), 'pendientes', RESUMEN_ID), {
        expected_amount: 7400,
        estimated_amount: 5000,
      }),
    )
  })
})

describe('households', () => {
  it('is readable by its member and not by anyone else', async () => {
    await assertFails(
      updateDoc(doc(asOutsider(), 'households', HOUSEHOLD), { name: 'Mía' }),
    )
    await assertSucceeds(
      updateDoc(doc(asMember(), 'households', HOUSEHOLD), {
        name: 'Casa Azul',
      }),
    )
  })
})

// A canary for the whole file: if the emulator is not actually enforcing
// rules, every assertFails above would pass for the wrong reason.
describe('the emulator is enforcing rules at all', () => {
  it('refuses a write to a collection the app does not have', async () => {
    await assertFails(setDoc(doc(asMember(), 'something_else', 'x'), { a: 1 }))
  })
})

// Renaming a card, exactly as the adapter writes it: one batch carrying the
// card's own four fields and the name of every Resumen of it, so a renamed
// card never leaves bills behind under the old name.
//
// Flor hit `updateCard/permission-denied` on a real card. The in-memory
// adapter has no rules, so every ordinary test of this passed.
describe('renaming a card', () => {
  const CARD = 'card-1'

  async function seed(
    resumenes: readonly { id: string; name: string; currency: string }[],
  ): Promise<void> {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(
        doc(db, 'cards', CARD),
        cardDocument({ name: 'Visa Santander Leo' }),
      )
      for (const resumen of resumenes) {
        await setDoc(doc(db, 'pendientes', resumen.id), {
          household_id: HOUSEHOLD,
          category_id: 'cat-tarjeta',
          name: resumen.name,
          due_date: Timestamp.fromDate(new Date(2026, 10, 10)),
          expected_amount: null,
          estimated_amount: 5000,
          recurring: false,
          auto_debit: false,
          status: 'pending',
          paid_expense_id: null,
          paid_at: null,
          created_at: Timestamp.now(),
          card_id: CARD,
          currency: resumen.currency,
          purchase_ids: ['purchase-1'],
        })
      }
    })
  }

  function rename(
    db: Firestore,
    to: string,
    resumenes: readonly { id: string; name: string }[],
  ) {
    const batch = writeBatch(db)
    batch.update(doc(db, 'cards', CARD), {
      name: to,
      kind: 'credito',
      currency: 'ARS',
      brand: 'visa',
    })
    for (const resumen of resumenes) {
      batch.update(doc(db, 'pendientes', resumen.id), { name: resumen.name })
    }
    return batch.commit()
  }

  it('renames the card and its peso Resumen in one commit', async () => {
    await seed([
      { id: `${CARD}_2026-11`, name: 'Visa Santander Leo', currency: 'ARS' },
    ])

    await assertSucceeds(
      rename(asMember(), 'Visa Santander', [
        { id: `${CARD}_2026-11`, name: 'Visa Santander' },
      ]),
    )
  })

  // The dollar Resumen of the same card is called "<card> US$", so it can
  // be told apart from the peso one in every list. The rule compares the
  // new bill name to the card's new name and nothing else.
  it('renames the dollar Resumen too', async () => {
    await seed([
      { id: `${CARD}_2026-11`, name: 'Visa Santander Leo', currency: 'ARS' },
      {
        id: `${CARD}_2026-11_USD`,
        name: 'Visa Santander Leo US$',
        currency: 'USD',
      },
    ])

    await assertSucceeds(
      rename(asMember(), 'Visa Santander', [
        { id: `${CARD}_2026-11`, name: 'Visa Santander' },
        { id: `${CARD}_2026-11_USD`, name: 'Visa Santander US$' },
      ]),
    )
  })

  // A paid Resumen is frozen for figures, but its name is still the card's
  // name: leaving it behind is two names for one thing.
  it('renames a Resumen that was already paid', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(
        doc(db, 'cards', CARD),
        cardDocument({ name: 'Visa Santander Leo' }),
      )
      await setDoc(doc(db, 'pendientes', `${CARD}_2026-10`), {
        household_id: HOUSEHOLD,
        category_id: 'cat-tarjeta',
        name: 'Visa Santander Leo',
        due_date: Timestamp.fromDate(new Date(2026, 9, 10)),
        expected_amount: 7400,
        estimated_amount: 5000,
        recurring: false,
        auto_debit: false,
        status: 'paid',
        paid_expense_id: 'expense-1',
        paid_at: Timestamp.now(),
        created_at: Timestamp.now(),
        card_id: CARD,
        currency: 'ARS',
        purchase_ids: ['purchase-1'],
      })
    })

    await assertSucceeds(
      rename(asMember(), 'Visa Santander', [
        { id: `${CARD}_2026-10`, name: 'Visa Santander' },
      ]),
    )
  })

  // The real shape of the bug: one bill per month the card has lived. A
  // card opened a year ago renames thirteen bills in one commit, and the
  // rules have to afford all of them.
  it('renames a year of bills in one commit', async () => {
    const months = Array.from({ length: 13 }, (_, index) => {
      const month = new Date(2025, 10 + index, 1)
      const stamp = `${String(month.getFullYear())}-${String(month.getMonth() + 1).padStart(2, '0')}`
      return {
        id: `${CARD}_${stamp}`,
        name: 'Visa Santander Leo',
        currency: 'ARS',
      }
    })
    await seed(months)

    await assertSucceeds(
      rename(
        asMember(),
        'Visa Santander',
        months.map((month) => ({ id: month.id, name: 'Visa Santander' })),
      ),
    )
  })

  it('refuses an outsider renaming it', async () => {
    await seed([
      { id: `${CARD}_2026-11`, name: 'Visa Santander Leo', currency: 'ARS' },
    ])

    await assertFails(
      rename(
        testEnv
          .authenticatedContext(OUTSIDER)
          .firestore() as unknown as Firestore,
        'Mía',
        [{ id: `${CARD}_2026-11`, name: 'Mía' }],
      ),
    )
  })
})

// Looking ahead at a month nobody has touched.
//
// The projection screen opens on the month ahead, which by definition has
// nothing saved for it yet. Reading a document that is not there is a real
// read: resource is null, and a rule that asks the document which
// household it belongs to throws rather than refuses, so the screen failed
// to load at all. Flor: "la pantalla de proyección me da error".
describe('reading a projection', () => {
  const MINE = `${HOUSEHOLD}_2026-12`

  it('lets a member read a month that has nothing saved yet', async () => {
    await assertSucceeds(getDoc(doc(asMember(), 'projections', MINE)))
  })

  it('lets a member read one that does exist', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'projections', MINE), {
        household_id: HOUSEHOLD,
        month_start: Timestamp.fromDate(new Date(2026, 11, 1)),
        excluded: [],
        overrides: {},
      })
    })

    await assertSucceeds(getDoc(doc(asMember(), 'projections', MINE)))
  })

  // The id is the only thing that can answer who an absent document would
  // belong to, so it has to be checked: otherwise anybody signed in could
  // probe any household's months.
  it("refuses an absent month of somebody else's household", async () => {
    await assertFails(
      getDoc(doc(asMember(), 'projections', 'household-otra_2026-12')),
    )
  })

  it('still saves the month it is told to save', async () => {
    await assertSucceeds(
      setDoc(doc(asMember(), 'projections', MINE), {
        household_id: HOUSEHOLD,
        month_start: Timestamp.fromDate(new Date(2026, 11, 1)),
        excluded: [`${String(new Date(2026, 11, 1).getTime())}-cat-1`],
        overrides: { otra: '1000' },
      }),
    )
  })
})
