import { describe, expect, it } from 'vitest'
import {
  householdToDocument,
  inviteToDocument,
  membershipToDocument,
  parseHouseholdDocument,
  parseHouseholdInviteDocument,
  parseHouseholdMemberDocument,
} from './converters'

describe('parseHouseholdDocument', () => {
  it('maps snake_case Firestore fields to a Household', () => {
    expect(
      parseHouseholdDocument({
        id: 'h1',
        data: {
          name: 'Casa Verde',
          monthly_budget: 1500.5,
          created_at: new Date('2026-01-15T12:00:00.000Z'),
        },
      }),
    ).toEqual({
      id: 'h1',
      name: 'Casa Verde',
      monthlyBudget: 1500.5,
      createdAt: new Date('2026-01-15T12:00:00.000Z'),
    })
  })

  it('reads a Firestore Timestamp via toDate', () => {
    const createdAt = new Date('2026-01-15T12:00:00.000Z')
    expect(
      parseHouseholdDocument({
        id: 'h1',
        data: {
          name: 'Casa Verde',
          monthly_budget: 100,
          created_at: { toDate: () => createdAt },
        },
      }).createdAt,
    ).toBe(createdAt)
  })
})

describe('parseHouseholdMemberDocument', () => {
  it('maps snake_case Firestore fields to a HouseholdMember', () => {
    expect(
      parseHouseholdMemberDocument({
        userId: 'user-1',
        data: {
          household_id: 'h1',
          joined_at: new Date('2026-01-15T12:00:00.000Z'),
        },
      }),
    ).toEqual({
      householdId: 'h1',
      userId: 'user-1',
      joinedAt: new Date('2026-01-15T12:00:00.000Z'),
    })
  })
})

describe('parseHouseholdInviteDocument', () => {
  it('maps snake_case Firestore fields to a HouseholdInvite', () => {
    expect(
      parseHouseholdInviteDocument({
        token: 'invite-token',
        data: {
          household_id: 'h1',
          created_at: new Date('2026-01-15T12:00:00.000Z'),
        },
      }),
    ).toEqual({
      householdId: 'h1',
      token: 'invite-token',
      createdAt: new Date('2026-01-15T12:00:00.000Z'),
    })
  })
})

describe('toDocument converters', () => {
  it('maps a Household to snake_case Firestore fields', () => {
    const createdAt = new Date('2026-01-15T12:00:00.000Z')
    expect(
      householdToDocument({
        name: 'Casa Verde',
        monthlyBudget: 1500.5,
        createdAt,
      }),
    ).toEqual({
      name: 'Casa Verde',
      monthly_budget: 1500.5,
      created_at: createdAt,
    })
  })

  it('maps a membership to snake_case Firestore fields', () => {
    const joinedAt = new Date('2026-01-15T12:00:00.000Z')
    expect(membershipToDocument({ householdId: 'h1', joinedAt })).toEqual({
      household_id: 'h1',
      joined_at: joinedAt,
    })
  })

  it('maps an invite to snake_case Firestore fields', () => {
    const createdAt = new Date('2026-01-15T12:00:00.000Z')
    expect(inviteToDocument({ householdId: 'h1', createdAt })).toEqual({
      household_id: 'h1',
      created_at: createdAt,
    })
  })
})
