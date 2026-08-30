import type {
  Household,
  HouseholdInvite,
  HouseholdMember,
  HouseholdsDb,
} from './types'
import { parseHouseholdName, parseMonthlyBudget } from './validate'

export class AlreadyInHouseholdError extends Error {
  override readonly name = 'AlreadyInHouseholdError'

  constructor() {
    super('User already belongs to a household')
  }
}

export class HouseholdAccessDeniedError extends Error {
  override readonly name = 'HouseholdAccessDeniedError'

  constructor() {
    super('Only household members can access this household')
  }
}

export class InviteNotFoundError extends Error {
  override readonly name = 'InviteNotFoundError'

  constructor() {
    super('Invite not found')
  }
}

export async function createHouseholdWithMembership(input: {
  readonly db: HouseholdsDb
  readonly userId: string
  readonly name: string
  readonly monthlyBudget: number
}): Promise<Household> {
  const name = parseHouseholdName(input.name)
  const monthlyBudget = parseMonthlyBudget(input.monthlyBudget)
  const { household } = await input.db.createHouseholdAndMembership({
    userId: input.userId,
    name,
    monthlyBudget,
  })
  return household
}

export async function updateHouseholdBudget(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly monthlyBudget: number
}): Promise<Household> {
  const monthlyBudget = parseMonthlyBudget(input.monthlyBudget)
  return input.db.updateMonthlyBudget({
    householdId: input.householdId,
    monthlyBudget,
  })
}

export async function updateHousehold(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly name: string
  readonly monthlyBudget: number
}): Promise<Household> {
  const name = parseHouseholdName(input.name)
  const monthlyBudget = parseMonthlyBudget(input.monthlyBudget)
  return input.db.updateHousehold({
    householdId: input.householdId,
    name,
    monthlyBudget,
  })
}

export async function getHousehold(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
}): Promise<Household> {
  return input.db.getHousehold(input.householdId)
}

export async function listHouseholdMembers(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
}): Promise<readonly HouseholdMember[]> {
  return input.db.listMembers(input.householdId)
}

export async function getMembership(input: {
  readonly db: HouseholdsDb
  readonly userId: string
}): Promise<HouseholdMember | null> {
  return input.db.getMembership(input.userId)
}

export async function getOrCreateHouseholdInvite(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
}): Promise<HouseholdInvite> {
  return input.db.getOrCreateInvite({ householdId: input.householdId })
}

export async function joinHousehold(input: {
  readonly db: HouseholdsDb
  readonly userId: string
  readonly token: string
}): Promise<HouseholdMember> {
  return input.db.joinHousehold({
    userId: input.userId,
    token: input.token,
  })
}

export async function leaveHousehold(input: {
  readonly db: HouseholdsDb
  readonly userId: string
}): Promise<void> {
  await input.db.leaveHousehold({ userId: input.userId })
}
