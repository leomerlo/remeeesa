import { describe, expect, it } from 'vitest'
import { HouseholdAccessDeniedError } from './households'
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
})
