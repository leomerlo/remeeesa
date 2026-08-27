import type { Household, HouseholdMember, HouseholdsDb } from './types'
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
