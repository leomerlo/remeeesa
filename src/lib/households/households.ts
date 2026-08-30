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

export class NotSignedInError extends Error {
  override readonly name = 'NotSignedInError'

  constructor() {
    super('Not signed in. Refresh the page and try again.')
  }
}

const FIRESTORE_OPERATION_ACTIONS: Record<string, string> = {
  createHouseholdAndMembership: 'create household',
  getHousehold: 'load household',
  listMembers: 'load members',
  getMembership: 'load membership',
  updateMonthlyBudget: 'save budget',
  updateHousehold: 'save household',
  getOrCreateInvite: 'generate invite link',
  joinHousehold: 'join household',
  listCategories: 'load categories',
  findOrCreateCategory: 'save category',
  createExpense: 'add expense',
  listExpensesInMonth: 'load expenses',
  getExpense: 'load expense',
  updateExpense: 'save expense',
  deleteExpense: 'delete expense',
}

export class FirestoreDeniedError extends Error {
  override readonly name = 'FirestoreDeniedError'
  readonly operation: string
  readonly code: string

  constructor(input: {
    readonly operation: string
    readonly code: string
    readonly detail?: string
  }) {
    const action =
      FIRESTORE_OPERATION_ACTIONS[input.operation] ?? input.operation
    const detail =
      input.detail !== undefined && input.detail.length > 0
        ? input.detail
        : input.code
    super(`Could not ${action}: ${detail}`)
    this.operation = input.operation
    this.code = input.code
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
