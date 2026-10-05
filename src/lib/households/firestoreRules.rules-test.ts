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
