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
      // A Resumen owes nothing until its statement is loaded.
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
  // only a human loading the statement sets what is owed.
  it('lets a purchase move the estimate, and lets the statement be loaded', async () => {
    await seedCard()
    const db = asMember()
    await setDoc(doc(db, 'pendientes', RESUMEN_ID), resumenDocument())

    await assertSucceeds(
      updateDoc(doc(db, 'pendientes', RESUMEN_ID), {
        estimated_amount: 7000,
        purchase_ids: ['purchase-1', 'purchase-2'],
      }),
    )
    await assertSucceeds(
      updateDoc(doc(db, 'pendientes', RESUMEN_ID), {
        expected_amount: 7400,
        estimated_amount: 7000,
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

  it('refuses an outsider loading the statement', async () => {
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
