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
})
