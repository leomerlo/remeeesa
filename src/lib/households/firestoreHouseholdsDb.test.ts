import { describe, expect, it } from 'vitest'
import rules from '../../../firestore.rules?raw'
import adapterSource from './firestoreHouseholdsDb.ts?raw'
import indexes from '../../../firestore.indexes.json'
import {
  AlreadyInHouseholdError,
  FIRESTORE_OPERATION_ACTIONS,
  FirestoreDeniedError,
} from './households'
import { mapHouseholdFirestoreError } from './firestoreHouseholdsDb'

// "No se pudo updateCategoryColor. Volvé a intentar." reached a real screen
// because a new adapter operation was added with no matching entry in
// FIRESTORE_OPERATION_ACTIONS -- FirestoreDeniedError falls back to the raw
// operation name verbatim when that lookup misses. Per-message unit tests
// only catch operations someone remembered to write a test for; this walks
// every withHouseholdAccess('...') call the adapter source actually makes
// and fails if any of them has no translation, so adding an operation
// without a Spanish phrase is a build-time failure, not a screenshot from a
// household member.
describe('FIRESTORE_OPERATION_ACTIONS', () => {
  it('has a Spanish phrase for every operation the adapter calls withHouseholdAccess with', () => {
    const operations = [
      ...adapterSource.matchAll(/withHouseholdAccess\(\s*\n?\s*'([a-zA-Z]+)'/g),
    ].map((match) => match[1])
    expect(operations.length).toBeGreaterThan(10)

    const untranslated = [...new Set(operations)].filter(
      (operation) => FIRESTORE_OPERATION_ACTIONS[operation] === undefined,
    )
    expect(untranslated).toEqual([])
  })
})

describe('mapHouseholdFirestoreError', () => {
  it('rethrows permission-denied as FirestoreDeniedError with the operation', () => {
    expect(() =>
      mapHouseholdFirestoreError(
        { code: 'permission-denied' },
        'createExpense',
      ),
    ).toThrow(FirestoreDeniedError)
    expect(() =>
      mapHouseholdFirestoreError(
        { code: 'permission-denied' },
        'createExpense',
      ),
    ).toThrow('No se pudo agregar el gasto. Volvé a intentar.')
  })

  it('includes the Firebase message when permission-denied has one', () => {
    expect(() =>
      mapHouseholdFirestoreError(
        {
          code: 'permission-denied',
          message: 'Missing or insufficient permissions.',
        },
        'findOrCreateCategory',
      ),
    ).toThrow('No se pudo guardar la categoría. Volvé a intentar.')
  })

  it('rethrows firestore/permission-denied as FirestoreDeniedError', () => {
    expect(() =>
      mapHouseholdFirestoreError(
        { code: 'firestore/permission-denied' },
        'listCategories',
      ),
    ).toThrow('No se pudo cargar las categorías. Volvé a intentar.')
  })

  it('rethrows other errors unchanged', () => {
    const error = new Error('Household not found')
    expect(() => mapHouseholdFirestoreError(error)).toThrow(error)
  })

  it('rethrows AlreadyInHouseholdError unchanged', () => {
    const error = new AlreadyInHouseholdError()
    expect(() => mapHouseholdFirestoreError(error)).toThrow(error)
  })
})

describe('firestore.rules founder membership', () => {
  it('requires the founder membership path to create a new household', () => {
    expect(rules).toContain(
      '!exists(/databases/$(database)/documents/households/$(request.resource.data.household_id))',
    )
  })

  it('keeps founder membership fields to household_id, joined_at, and display_name', () => {
    expect(rules).toContain(
      "data.keys().hasOnly(['household_id', 'joined_at', 'display_name'])",
    )
  })
})

describe('firestore.rules member display name updates', () => {
  it('lets a member update only their own display_name, nothing else', () => {
    expect(rules).toMatch(
      /match \/household_members\/\{userId\}[\s\S]*allow update: if isSignedIn\(\)\s*\n\s*&& request\.auth\.uid == userId\s*\n\s*&& isValidDisplayNameUpdate\(\);/,
    )
  })

  it('restricts the diff to exactly display_name and requires a non-empty string', () => {
    expect(rules).toContain('function isValidDisplayNameUpdate()')
    expect(rules).toContain(
      "request.resource.data.diff(resource.data).affectedKeys().hasOnly(['display_name'])",
    )
    expect(rules).toContain('request.resource.data.display_name is string')
    expect(rules).toContain('request.resource.data.display_name.size() > 0')
  })
})

describe('firestore.rules household updates', () => {
  it('lets members update the household name and monthly budget', () => {
    expect(rules).toContain(
      "request.resource.data.diff(resource.data).affectedKeys().hasOnly(['monthly_budget', 'name'])",
    )
    expect(rules).toContain('request.resource.data.name is string')
    expect(rules).toContain('request.resource.data.name.size() > 0')
  })
})

describe('firestore.rules invite join', () => {
  it('lets any signed-in user get an invite by token', () => {
    expect(rules).toMatch(
      /match \/household_invites\/\{token\}[\s\S]*allow get: if isSignedIn\(\);/,
    )
  })

  it('keeps invite list members-only', () => {
    expect(rules).toMatch(
      /match \/household_invites\/\{token\}[\s\S]*allow list: if isSignedIn\(\) && isMemberOf\(resource\.data\.household_id\);/,
    )
  })

  it('requires invite_token on join membership writes', () => {
    expect(rules).toContain('function isValidJoinMembership(data)')
    expect(rules).toContain(
      "data.keys().hasOnly(['household_id', 'joined_at', 'invite_token', 'display_name'])",
    )
    expect(rules).toContain(
      'exists(/databases/$(database)/documents/household_invites/$(data.invite_token))',
    )
    expect(rules).toContain(
      'get(/databases/$(database)/documents/household_invites/$(data.invite_token)).data.household_id == data.household_id',
    )
  })

  it('does not allow joining an existing household without a token', () => {
    expect(rules).toContain(
      'exists(/databases/$(database)/documents/households/$(request.resource.data.household_id))',
    )
    expect(rules).toContain('&& isValidJoinMembership(request.resource.data)')
  })
})

describe('firestore.rules categories', () => {
  it('lets members get a missing category id for their household so find-or-create can run', () => {
    expect(rules).toContain('function isOwnHouseholdCategoryId(categoryId)')
    expect(rules).toContain(
      'allow get: if isSignedIn()\n        && resource == null\n        && isOwnHouseholdCategoryId(categoryId);',
    )
    expect(rules).toContain(
      'allow get: if isSignedIn()\n        && resource != null\n        && isMemberOf(resource.data.household_id);',
    )
  })

  it('lets only household members list existing categories', () => {
    expect(rules).toMatch(
      /match \/categories\/\{categoryId\}[\s\S]*allow list: if isMemberOf\(resource\.data\.household_id\);/,
    )
  })

  it('lets members create categories and founders seed them with the household', () => {
    expect(rules).toContain('function isValidCategory(data)')
    expect(rules).toContain(
      "data.keys().hasOnly(['household_id', 'name', 'color', 'created_at'])",
    )
    expect(rules).toContain("data.color.matches('^#[0-9a-fA-F]{6}$')")
    expect(rules).toContain('function canWriteCategoryFor(householdId)')
    expect(rules).toContain(
      'allow create: if isValidCategory(request.resource.data)',
    )
    expect(rules).toContain(
      '&& canWriteCategoryFor(request.resource.data.household_id)',
    )
  })

  it('lets a member change only a category’s color or name, never its household or createdAt', () => {
    expect(rules).toContain('function isValidCategoryUpdate()')
    expect(rules).toContain("hasOnly(['color', 'name'])")
    expect(rules).toContain(
      'request.resource.data.household_id == resource.data.household_id\n        && request.resource.data.created_at == resource.data.created_at',
    )
    // isValidCategory is re-run on the result, so the color still has to look
    // like a hex color and the name still has to be non-blank after the edit.
    expect(rules).toContain('&& isValidCategory(request.resource.data);')
    expect(rules).toMatch(
      /match \/categories\/\{categoryId\}[\s\S]*allow update: if isMemberOf\(resource\.data\.household_id\)\n\s*&& isValidCategoryUpdate\(\);/,
    )
  })

  it('lets a member delete a category', () => {
    expect(rules).toMatch(
      /match \/categories\/\{categoryId\}[\s\S]*allow delete: if isMemberOf\(resource\.data\.household_id\);/,
    )
  })
})

describe('firestore.indexes.json covers the expense queries', () => {
  // Firestore appends an implicit __name__ sort to any ordered query, so a
  // query ordering by expense_date alone needs a *different* composite index
  // than one ordering by expense_date then created_at. Shipping the first kind
  // fails only in production, with "The query requires an index" -- exactly
  // what Histórico hit. Every expense query therefore carries both orders, so
  // one declared index serves all of them.
  it('orders every expense query by expense_date and then created_at', () => {
    const orderings = [
      ...adapterSource.matchAll(/orderBy\('expense_date', 'desc'\),\s*(\S+)/g),
    ]
    expect(orderings.length).toBeGreaterThan(0)
    for (const [, next] of orderings) {
      expect(next).toBe("orderBy('created_at',")
    }
  })

  it('declares the composite index those queries need', () => {
    const expenseIndex = indexes.indexes.find(
      (index) => index.collectionGroup === 'expenses',
    )
    expect(expenseIndex?.fields).toEqual([
      { fieldPath: 'household_id', order: 'ASCENDING' },
      { fieldPath: 'expense_date', order: 'DESCENDING' },
      { fieldPath: 'created_at', order: 'DESCENDING' },
    ])
  })
})

describe('firestore.rules pendiente category repoint', () => {
  // Renaming or merging a category has to move every Pendiente that references
  // it, paid ones included -- otherwise a paid bill would keep pointing at a
  // category that no longer exists. This is the one exception to "paid Pendientes
  // are frozen", and it is deliberately narrow.
  it('permits a category_id-only update even on a paid Pendiente', () => {
    expect(rules).toContain('function isPendienteCategoryRepoint()')
    expect(rules).toContain("hasOnly(['category_id'])")
    expect(rules).toContain(
      '&& (isValidPendienteUpdate() || isValidPendienteMarkPaid() || isPendienteCategoryRepoint());',
    )
  })

  it('requires the destination category to exist', () => {
    expect(rules).toMatch(
      /function isPendienteCategoryRepoint\(\)[\s\S]*exists\(\/databases\/\$\(database\)\/documents\/categories\/\$\(request\.resource\.data\.category_id\)\);/,
    )
  })

  it('does not let the repoint carry any other field along', () => {
    expect(rules).toMatch(
      /function isPendienteCategoryRepoint\(\)[\s\S]*affectedKeys\(\)\n\s*\.hasOnly\(\['category_id'\]\)/,
    )
  })
})

describe('firestore.rules expenses', () => {
  it('lets only household members read expenses', () => {
    expect(rules).toMatch(
      /match \/expenses\/\{expenseId\}[\s\S]*allow read: if isMemberOf\(resource\.data\.household_id\);/,
    )
  })

  it('lets members create expenses attributed to themselves with price and date checks', () => {
    expect(rules).toContain('function isValidExpense(data)')
    expect(rules).toContain(
      "data.keys().hasOnly(['household_id', 'category_id', 'member_id', 'name', 'price', 'comments', 'expense_date', 'pendiente_id', 'created_at', 'author_display_name'])",
    )
    expect(rules).toContain('data.price is number')
    expect(rules).toContain('data.price > 0')
    expect(rules).toContain('data.expense_date is timestamp')
    expect(rules).toContain('expenseDateNotInFuture(data.expense_date)')
    expect(rules).not.toContain('data.expense_date <= request.time')
    expect(rules).toContain(
      'request.resource.data.member_id == request.auth.uid',
    )
    expect(rules).toMatch(
      /match \/expenses\/\{expenseId\}[\s\S]*allow create: if isMemberOf\(request\.resource\.data\.household_id\)/,
    )
    expect(rules).toContain('function isValidExpenseUpdate()')
    // member_id/author_display_name may change together now (reassigning
    // an Expense's author), validated by isValidExpenseReassign rather
    // than frozen unchanged the way they used to be.
    expect(rules).toContain('function isValidExpenseReassign()')
    expect(rules).toContain(
      'exists(/databases/$(database)/documents/household_members/$(request.resource.data.member_id))',
    )
    expect(rules).toContain(
      'get(/databases/$(database)/documents/household_members/$(request.resource.data.member_id)).data.household_id == request.resource.data.household_id',
    )
    expect(rules).toMatch(
      /match \/expenses\/\{expenseId\}[\s\S]*allow update: if isMemberOf\(resource\.data\.household_id\)/,
    )
    expect(rules).toContain('function isValidExpenseUpdate()')
    expect(rules).toContain('function expenseDateNotInFuture(expenseDate)')
    // pendiente_id: null for a plain Gasto, or a real Pendiente in this same
    // household for a "servicio" Expense created by markPendientePaid.
    expect(rules).toContain('data.pendiente_id == null')
    expect(rules).toContain(
      'exists(/databases/$(database)/documents/pendientes/$(data.pendiente_id))',
    )
    expect(rules).toContain(
      'get(/databases/$(database)/documents/pendientes/$(data.pendiente_id)).data.household_id == data.household_id',
    )
    expect(rules).toContain(
      "expenseDate < request.time + duration.value(1, 'd')",
    )
    expect(rules).not.toContain('request.time.year')
    expect(rules).not.toContain('request.time.month')
    expect(rules).not.toContain('request.time.day')
    expect(rules).toContain(
      "hasOnly(['name', 'price', 'category_id', 'comments', 'expense_date', 'member_id', 'author_display_name'])",
    )
    expect(rules).toMatch(
      /!request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\s*\.hasAny\(\['household_id', 'created_at'\]\)/,
    )
    expect(rules).toMatch(
      /allow update: if isMemberOf\(resource\.data\.household_id\)\s*&& isValidExpenseUpdate\(\);/,
    )
    expect(rules).toMatch(
      /match \/expenses\/\{expenseId\}[\s\S]*allow delete: if isMemberOf\(resource\.data\.household_id\);/,
    )
  })
})

describe('firestore.rules pendientes', () => {
  it('lets only household members read pendientes', () => {
    expect(rules).toMatch(
      /match \/pendientes\/\{pendienteId\}[\s\S]*allow read: if isMemberOf\(resource\.data\.household_id\);/,
    )
  })

  it('requires the exact field set and a category belonging to the same household', () => {
    expect(rules).toContain('function isValidPendiente(data)')
    expect(rules).toContain(
      "data.keys().hasOnly(['household_id', 'category_id', 'name', 'due_date', 'expected_amount', 'recurring', 'status', 'paid_expense_id', 'paid_at', 'created_at'])",
    )
    expect(rules).toContain('data.due_date is timestamp')
    expect(rules).toContain(
      'data.expected_amount == null || (data.expected_amount is number && data.expected_amount > 0)',
    )
    expect(rules).toContain('data.recurring is bool')
    expect(rules).toContain(
      'exists(/databases/$(database)/documents/categories/$(data.category_id))',
    )
    expect(rules).toContain(
      'get(/databases/$(database)/documents/categories/$(data.category_id)).data.household_id == data.household_id',
    )
  })

  it('requires household_id and category_id to be non-empty strings', () => {
    expect(rules).toMatch(
      /function isValidPendiente\(data\) \{[\s\S]*?data\.household_id is string[\s\S]*?data\.household_id\.size\(\) > 0/,
    )
    expect(rules).toMatch(
      /function isValidPendiente\(data\) \{[\s\S]*?data\.category_id is string[\s\S]*?data\.category_id\.size\(\) > 0/,
    )
  })

  it('requires a non-blank name', () => {
    expect(rules).toMatch(
      /function isValidPendiente\(data\) \{[\s\S]*?data\.name is string[\s\S]*?data\.name\.size\(\) > 0[\s\S]*?data\.name\.matches\('\.\*\\\\S\.\*'\)/,
    )
  })

  it('blocks creating a pendiente with any status other than pending', () => {
    expect(rules).toContain("data.status == 'pending'")
  })

  it('blocks creating a pendiente with a non-null paid_expense_id', () => {
    expect(rules).toContain('data.paid_expense_id == null')
  })

  it('lets members create pendientes', () => {
    expect(rules).toMatch(
      /match \/pendientes\/\{pendienteId\}[\s\S]*allow create: if isMemberOf\(request\.resource\.data\.household_id\)\s*&& isValidPendiente\(request\.resource\.data\);/,
    )
  })

  it('lets members update a still-pending pendiente, restricted to the editable fields', () => {
    expect(rules).toContain('function isValidPendienteUpdate()')
    expect(rules).toContain("resource.data.status == 'pending'")
    expect(rules).toMatch(
      /function isValidPendienteUpdate\(\) \{[\s\S]*?request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\s*\.hasOnly\(\['name', 'category_id', 'due_date', 'expected_amount', 'recurring'\]\)/,
    )
    expect(rules).toMatch(
      /function isValidPendienteUpdate\(\) \{[\s\S]*?!request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\s*\.hasAny\(\['household_id', 'status', 'paid_expense_id', 'paid_at', 'created_at'\]\)/,
    )
    expect(rules).toMatch(
      /match \/pendientes\/\{pendienteId\}[\s\S]*allow update: if isMemberOf\(resource\.data\.household_id\)\s*&& \(isValidPendienteUpdate\(\) \|\| isValidPendienteMarkPaid\(\) \|\| isPendienteCategoryRepoint\(\)\);/,
    )
  })

  it('re-validates the updated category against the same household on update', () => {
    expect(rules).toMatch(
      /function isValidPendienteUpdate\(\) \{[\s\S]*?exists\(\/databases\/\$\(database\)\/documents\/categories\/\$\(request\.resource\.data\.category_id\)\)/,
    )
    expect(rules).toMatch(
      /function isValidPendienteUpdate\(\) \{[\s\S]*?get\(\/databases\/\$\(database\)\/documents\/categories\/\$\(request\.resource\.data\.category_id\)\)\.data\.household_id == resource\.data\.household_id/,
    )
  })

  it('lets members delete a still-pending pendiente only', () => {
    expect(rules).toMatch(
      /match \/pendientes\/\{pendienteId\}[\s\S]*allow delete: if isMemberOf\(resource\.data\.household_id\)\s*&& resource\.data\.status == 'pending';/,
    )
  })
})

// True multi-writer race behavior and the rules' actual server-side
// enforcement are unverifiable without a Firestore emulator in this repo's
// CI -- this is structural inspection only. The memory-double concurrency
// test in pendientes.test.ts is what actually behaviorally proves the
// idempotency logic.
describe('firestore.rules pendientes mark-paid', () => {
  it('defines isValidPendienteMarkPaid with a diff restricted to status, paid_expense_id, and paid_at, requiring the stored status to still be pending', () => {
    expect(rules).toContain('function isValidPendienteMarkPaid()')
    expect(rules).toMatch(
      /function isValidPendienteMarkPaid\(\) \{[\s\S]*?resource\.data\.status == 'pending'/,
    )
    expect(rules).toMatch(
      /function isValidPendienteMarkPaid\(\) \{[\s\S]*?request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\['status', 'paid_expense_id', 'paid_at'\]\)/,
    )
    expect(rules).toMatch(
      /function isValidPendienteMarkPaid\(\) \{[\s\S]*?request\.resource\.data\.status == 'paid'/,
    )
    expect(rules).toMatch(
      /function isValidPendienteMarkPaid\(\) \{[\s\S]*?resource\.data\.paid_expense_id == null/,
    )
    expect(rules).toMatch(
      /function isValidPendienteMarkPaid\(\) \{[\s\S]*?request\.resource\.data\.paid_expense_id is string[\s\S]*?request\.resource\.data\.paid_expense_id\.size\(\) > 0/,
    )
    expect(rules).toMatch(
      /function isValidPendienteMarkPaid\(\) \{[\s\S]*?resource\.data\.paid_at == null/,
    )
    expect(rules).toMatch(
      /function isValidPendienteMarkPaid\(\) \{[\s\S]*?request\.resource\.data\.paid_at is timestamp/,
    )
  })

  it('requires paid_expense_id to reference a real Expense in the same household, closing the fake-payment-record gap', () => {
    expect(rules).toMatch(
      /function isValidPendienteMarkPaid\(\) \{[\s\S]*?existsAfter\(\/databases\/\$\(database\)\/documents\/expenses\/\$\(request\.resource\.data\.paid_expense_id\)\)/,
    )
    expect(rules).toMatch(
      /function isValidPendienteMarkPaid\(\) \{[\s\S]*?getAfter\(\/databases\/\$\(database\)\/documents\/expenses\/\$\(request\.resource\.data\.paid_expense_id\)\)\.data\.household_id == resource\.data\.household_id/,
    )
  })

  it('ORs isValidPendienteMarkPaid into the pendiente update rule alongside isValidPendienteUpdate', () => {
    expect(rules).toMatch(
      /match \/pendientes\/\{pendienteId\}[\s\S]*allow update: if isMemberOf\(resource\.data\.household_id\)\s*&& \(isValidPendienteUpdate\(\) \|\| isValidPendienteMarkPaid\(\) \|\| isPendienteCategoryRepoint\(\)\);/,
    )
  })
})

describe('markPendientePaid adapter', () => {
  it('resolves memberId via awaitAuthenticatedUserId, not trusted from input, and uses it to attribute the generated expense', () => {
    expect(adapterSource).toMatch(
      /async markPendientePaid\(input\) \{[\s\S]*?const memberId = await awaitAuthenticatedUserId\(firestore\)/,
    )
    // Scoped to markPendientePaid's own body (it's the adapter's last
    // method, so slicing from its declaration to EOF captures exactly
    // that) rather than the whole file -- updateExpense legitimately
    // writes `memberId: input.memberId` elsewhere now, for reassigning an
    // Expense's author (rules-validated, see isValidExpenseReassign), and
    // that is not the same trust boundary this guards: markPendientePaid's
    // memberId must always come from the authenticated caller, never from
    // client input, since it attributes a brand-new Expense rather than
    // reassigning an existing one under an explicit membership check.
    const markPendientePaidSource = adapterSource.slice(
      adapterSource.indexOf('async markPendientePaid(input) {'),
    )
    expect(markPendientePaidSource).not.toMatch(/memberId: input\.memberId/)
  })

  it('runs the status transition and expense creation inside a single Firestore transaction', () => {
    expect(adapterSource).toMatch(
      /async markPendientePaid\(input\) \{[\s\S]*?runTransaction\(firestore, async \(tx\) => \{/,
    )
  })

  it('reads the pendiente via tx.get before issuing any write, and throws PendienteAlreadyPaidError when it is no longer pending', () => {
    expect(adapterSource).toMatch(
      /async markPendientePaid\(input\) \{[\s\S]*?const pendienteSnap = await tx\.get\(pendienteRef\)[\s\S]*?if \(current\.status !== 'pending'\) \{[\s\S]*?throw new PendienteAlreadyPaidError\(\)/,
    )
  })

  it('writes the expense via tx.set before updating the pendiente status via tx.update', () => {
    expect(adapterSource).toMatch(
      /async markPendientePaid\(input\) \{[\s\S]*?tx\.set\(expenseRef, \{[\s\S]*?tx\.update\(pendienteRef, \{[\s\S]*?status: 'paid',[\s\S]*?paid_expense_id: expenseRef\.id,/,
    )
  })

  // runTransaction retries its callback on contention. A doc ref minted
  // inside the callback would get a fresh client-side id on every attempt,
  // so the id written to the store could drift from the one handed back to
  // the caller -- hoisting it out pins one id for the whole operation. The
  // hoisted ref is harmless on the non-recurring path: doc(collection(...))
  // only mints an id locally, it writes nothing.
  it('mints the next-cycle doc ref outside the runTransaction callback so retries keep one stable id', () => {
    expect(adapterSource).toMatch(
      /async markPendientePaid\(input\) \{[\s\S]*?const nextPendienteRef = doc\(collection\(firestore, 'pendientes'\)\)[\s\S]*?runTransaction\(firestore, async \(tx\) => \{/,
    )
  })

  it('writes the next cycle via tx.set after the pendiente update, guarded by the recurring check', () => {
    expect(adapterSource).toMatch(
      /async markPendientePaid\(input\) \{[\s\S]*?tx\.update\(pendienteRef, \{[\s\S]*?current\.recurring[\s\S]*?tx\.set\(nextPendienteRef, \{/,
    )
  })

  it('carries the just-paid amount into the next cycle as its pre-filled expected amount', () => {
    expect(adapterSource).toMatch(
      /tx\.set\(nextPendienteRef, \{[\s\S]*?expectedAmount: input\.finalAmount,/,
    )
  })

  // recurring: true is what keeps the series going -- writing false here
  // would silently end every recurring pendiente after one extra cycle, and the
  // ordering assertions above would not notice.
  it('writes the next cycle as a fresh unpaid recurring pendiente', () => {
    expect(adapterSource).toMatch(
      /tx\.set\(nextPendienteRef, \{[\s\S]*?recurring: true,[\s\S]*?status: 'pending',[\s\S]*?paidExpenseId: null,/,
    )
  })
})

describe('listRecentExpenses adapter', () => {
  it('scopes to the household, orders newest expense_date first with created_at as tiebreaker, and applies the caller limit', () => {
    expect(adapterSource).toMatch(
      /async listRecentExpenses\(input\) \{[\s\S]*?where\('household_id', '==', input\.householdId\),[\s\S]*?orderBy\('expense_date', 'desc'\),[\s\S]*?orderBy\('created_at', 'desc'\),[\s\S]*?limit\(input\.limit\),[\s\S]*?\}/,
    )
  })
})

describe('listPendientes adapter', () => {
  it('scopes to the household, filters to pending status, and orders by due date ascending -- matching the household_id+status+due_date composite index', () => {
    expect(adapterSource).toMatch(
      /async listPendientes\(input\) \{[\s\S]*?where\('household_id', '==', input\.householdId\),[\s\S]*?where\('status', '==', 'pending'\),[\s\S]*?orderBy\('due_date', 'asc'\),[\s\S]*?\}/,
    )
  })
})

describe('createExpense adapter', () => {
  it('waits for auth before writing so Firestore sees request.auth', () => {
    expect(adapterSource).toMatch(
      /async createExpense\([\s\S]*awaitAuthenticatedUserId\(firestore\)/,
    )
  })

  it('treats a missing Firebase user as not signed in instead of a membership denial', () => {
    expect(adapterSource).toContain('throw new NotSignedInError()')
  })
})

describe('updatePendiente/deletePendiente adapter', () => {
  // The domain layer's own getPendienteOrThrow always pre-checks status
  // before either adapter method runs, so this re-check is otherwise never
  // exercised by any test that goes through the domain wrapper -- assert it
  // exists in the compiled adapter source directly, same convention as the
  // other adapter-source checks in this file.
  it('re-checks status against a fresh read before writing, throwing PendienteAlreadyPaidError', () => {
    expect(adapterSource).toMatch(
      /async updatePendiente\(input\) \{[\s\S]*?if \(current\.status !== 'pending'\) \{[\s\S]*?throw new PendienteAlreadyPaidError\(\)/,
    )
    expect(adapterSource).toMatch(
      /async deletePendiente\(input\) \{[\s\S]*?status !== 'pending'[\s\S]*?throw new PendienteAlreadyPaidError\(\)/,
    )
  })
})
