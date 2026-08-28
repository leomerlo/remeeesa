import { describe, expect, it } from 'vitest'
import rules from '../../../firestore.rules?raw'
import {
  AlreadyInHouseholdError,
  HouseholdAccessDeniedError,
} from './households'
import { mapHouseholdFirestoreError } from './firestoreHouseholdsDb'

describe('mapHouseholdFirestoreError', () => {
  it('rethrows permission-denied as HouseholdAccessDeniedError', () => {
    expect(() =>
      mapHouseholdFirestoreError({ code: 'permission-denied' }),
    ).toThrow(HouseholdAccessDeniedError)
  })

  it('rethrows firestore/permission-denied as HouseholdAccessDeniedError', () => {
    expect(() =>
      mapHouseholdFirestoreError({ code: 'firestore/permission-denied' }),
    ).toThrow(HouseholdAccessDeniedError)
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
    expect(rules).toMatch(
      /match \/categories\/\{categoryId\}[\s\S]*allow get: if isSignedIn\(\) && \(/,
    )
    expect(rules).toContain(
      'resource == null && isOwnHouseholdCategoryId(categoryId)',
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
    expect(rules).toContain('data.expense_date <= request.time')
    expect(rules).toContain(
      'request.resource.data.member_id == request.auth.uid',
    )
    expect(rules).toMatch(
      /match \/expenses\/\{expenseId\}[\s\S]*allow create: if isMemberOf\(request\.resource\.data\.household_id\)/,
    )
    expect(rules).toMatch(
      /match \/expenses\/\{expenseId\}[\s\S]*allow update, delete: if false;/,
    )
  })
})
