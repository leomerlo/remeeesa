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
  it('denies membership create against an already-existing household', () => {
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
