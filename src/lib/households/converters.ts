import {
  isRecord,
  parseRequiredString,
  parseTimestamp,
} from '@/lib/firestore/documentParsing'
import type { Household, HouseholdInvite, HouseholdMember } from './types'
import { parseHouseholdName, parseMonthlyBudget } from './validate'

export function parseHouseholdDocument(input: {
  readonly id: string
  readonly data: unknown
}): Household {
  if (input.id.trim() === '') {
    throw new Error('Household id must be non-empty')
  }
  if (!isRecord(input.data)) {
    throw new Error('Household document must be an object')
  }

  const { name, monthly_budget, created_at } = input.data
  if (typeof name !== 'string') {
    throw new Error('Household name must be a string')
  }
  if (typeof monthly_budget !== 'number') {
    throw new Error('Household monthly_budget must be a number')
  }

  return {
    id: input.id,
    name: parseHouseholdName(name),
    monthlyBudget: parseMonthlyBudget(monthly_budget),
    createdAt: parseTimestamp(created_at, 'created_at'),
  }
}

// Falls back to a generic label rather than throwing: a membership doc
// created before display_name existed (or written by an older client
// mid-rollout) has none, and that's a normal, expected shape to read --
// not a corrupt document.
const FALLBACK_MEMBER_DISPLAY_NAME = 'Miembro'

export function parseHouseholdMemberDocument(input: {
  readonly userId: string
  readonly data: unknown
}): HouseholdMember {
  if (input.userId.trim() === '') {
    throw new Error('Member user id must be non-empty')
  }
  if (!isRecord(input.data)) {
    throw new Error('Membership document must be an object')
  }

  const rawDisplayName = input.data.display_name
  const displayName =
    typeof rawDisplayName === 'string' && rawDisplayName.trim() !== ''
      ? rawDisplayName.trim()
      : FALLBACK_MEMBER_DISPLAY_NAME

  return {
    householdId: parseRequiredString(input.data.household_id, 'household_id'),
    userId: input.userId,
    joinedAt: parseTimestamp(input.data.joined_at, 'joined_at'),
    displayName,
  }
}

export function parseHouseholdInviteDocument(input: {
  readonly token: string
  readonly data: unknown
}): HouseholdInvite {
  if (input.token.trim() === '') {
    throw new Error('Invite token must be non-empty')
  }
  if (!isRecord(input.data)) {
    throw new Error('Invite document must be an object')
  }

  return {
    householdId: parseRequiredString(input.data.household_id, 'household_id'),
    token: input.token,
    createdAt: parseTimestamp(input.data.created_at, 'created_at'),
  }
}

export function householdToDocument(input: {
  readonly name: string
  readonly monthlyBudget: number
  readonly createdAt: Date
}): {
  readonly name: string
  readonly monthly_budget: number
  readonly created_at: Date
} {
  return {
    name: input.name,
    monthly_budget: input.monthlyBudget,
    created_at: input.createdAt,
  }
}

export function membershipToDocument(input: {
  readonly householdId: string
  readonly joinedAt: Date
  readonly displayName: string
}): {
  readonly household_id: string
  readonly joined_at: Date
  readonly display_name: string
} {
  return {
    household_id: input.householdId,
    joined_at: input.joinedAt,
    display_name: input.displayName,
  }
}

export function joinMembershipToDocument(input: {
  readonly householdId: string
  readonly joinedAt: Date
  readonly inviteToken: string
  readonly displayName: string
}): {
  readonly household_id: string
  readonly joined_at: Date
  readonly invite_token: string
  readonly display_name: string
} {
  return {
    ...membershipToDocument({
      householdId: input.householdId,
      joinedAt: input.joinedAt,
      displayName: input.displayName,
    }),
    invite_token: input.inviteToken,
  }
}

export function inviteToDocument(input: {
  readonly householdId: string
  readonly createdAt: Date
}): {
  readonly household_id: string
  readonly created_at: Date
} {
  return {
    household_id: input.householdId,
    created_at: input.createdAt,
  }
}
