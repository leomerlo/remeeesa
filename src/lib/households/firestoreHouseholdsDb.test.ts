import { describe, expect, it } from 'vitest'
import rules from '../../../firestore.rules?raw'
import adapterSource from './firestoreHouseholdsDb.ts?raw'
import { AlreadyInHouseholdError, FirestoreDeniedError } from './households'
import { mapHouseholdFirestoreError } from './firestoreHouseholdsDb'

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
    ).toThrow('Could not add expense: permission-denied')
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
    ).toThrow('Could not save category: Missing or insufficient permissions.')
  })

  it('rethrows firestore/permission-denied as FirestoreDeniedError', () => {
    expect(() =>
      mapHouseholdFirestoreError(
        { code: 'firestore/permission-denied' },
        'listCategories',
      ),
    ).toThrow('Could not load categories: firestore/permission-denied')
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

  it('keeps founder membership fields to household_id and joined_at', () => {
    expect(rules).toContain(
      "data.keys().hasOnly(['household_id', 'joined_at'])",
    )
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
      "data.keys().hasOnly(['household_id', 'joined_at', 'invite_token'])",
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
      "data.keys().hasOnly(['household_id', 'name', 'created_at'])",
    )
    expect(rules).toContain('function canWriteCategoryFor(householdId)')
    expect(rules).toContain(
      'allow create: if isValidCategory(request.resource.data)',
    )
    expect(rules).toContain(
      '&& canWriteCategoryFor(request.resource.data.household_id)',
    )
    expect(rules).toMatch(
      /match \/categories\/\{categoryId\}[\s\S]*allow update, delete: if false;/,
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
      "data.keys().hasOnly(['household_id', 'category_id', 'member_id', 'name', 'price', 'comments', 'expense_date', 'created_at', 'author_display_name'])",
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
    expect(rules).toContain(
      'request.resource.data.author_display_name == resource.data.author_display_name',
    )
    expect(rules).toContain(
      'request.resource.data.member_id == resource.data.member_id',
    )
    expect(rules).toMatch(
      /match \/expenses\/\{expenseId\}[\s\S]*allow update: if isMemberOf\(resource\.data\.household_id\)/,
    )
    expect(rules).toContain('function isValidExpenseUpdate()')
    expect(rules).toContain('function expenseDateNotInFuture(expenseDate)')
    expect(rules).toContain(
      "expenseDate < request.time + duration.value(1, 'd')",
    )
    expect(rules).not.toContain('request.time.year')
    expect(rules).not.toContain('request.time.month')
    expect(rules).not.toContain('request.time.day')
    expect(rules).toMatch(
      /!request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\s*\.hasAny\(\['household_id', 'member_id', 'author_display_name', 'created_at'\]\)/,
    )
    expect(rules).toMatch(
      /allow update: if isMemberOf\(resource\.data\.household_id\)\s*&& isValidExpenseUpdate\(\);/,
    )
    expect(rules).toMatch(
      /match \/expenses\/\{expenseId\}[\s\S]*allow delete: if isMemberOf\(resource\.data\.household_id\);/,
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
