import type { Household, HouseholdInvite, HouseholdMember } from './types'
import { parseHouseholdName, parseMonthlyBudget } from './validate'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasToDate(value: unknown): value is { toDate: () => unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  )
}

function parseTimestamp(value: unknown, field: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }
  if (hasToDate(value)) {
    const date = value.toDate()
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      return date
    }
  }
  throw new Error(`${field} must be a timestamp`)
}

function parseRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`)
  }
  return value
}

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

  return {
    householdId: parseRequiredString(input.data.household_id, 'household_id'),
    userId: input.userId,
    joinedAt: parseTimestamp(input.data.joined_at, 'joined_at'),
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
}): {
  readonly household_id: string
  readonly joined_at: Date
} {
  return {
    household_id: input.householdId,
    joined_at: input.joinedAt,
  }
}

export function joinMembershipToDocument(input: {
  readonly householdId: string
  readonly joinedAt: Date
  readonly inviteToken: string
}): {
  readonly household_id: string
  readonly joined_at: Date
  readonly invite_token: string
} {
  return {
    ...membershipToDocument({
      householdId: input.householdId,
      joinedAt: input.joinedAt,
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
