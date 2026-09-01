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
    super('El usuario ya pertenece a un hogar')
  }
}

export class HouseholdAccessDeniedError extends Error {
  override readonly name = 'HouseholdAccessDeniedError'

  constructor() {
    super('Solo los integrantes del hogar pueden acceder a este hogar')
  }
}

export class NotSignedInError extends Error {
  override readonly name = 'NotSignedInError'

  constructor() {
    super('No hay una sesión iniciada. Actualizá la página e intentá de nuevo.')
  }
}

const FIRESTORE_OPERATION_ACTIONS: Record<string, string> = {
  createHouseholdAndMembership: 'crear el hogar',
  getHousehold: 'cargar el hogar',
  listMembers: 'cargar los integrantes',
  getMembership: 'cargar la membresía',
  updateMonthlyBudget: 'guardar el presupuesto',
  updateHousehold: 'guardar el hogar',
  getOrCreateInvite: 'generar el link de invitación',
  joinHousehold: 'unirse al hogar',
  listCategories: 'cargar las categorías',
  findOrCreateCategory: 'guardar la categoría',
  createExpense: 'agregar el gasto',
  listExpensesInMonth: 'cargar los gastos',
  listRecentExpenses: 'cargar los gastos',
  getExpense: 'cargar el gasto',
  updateExpense: 'guardar el gasto',
  deleteExpense: 'eliminar el gasto',
}

export class FirestoreDeniedError extends Error {
  override readonly name = 'FirestoreDeniedError'
  readonly operation: string
  readonly code: string
  // The raw Firestore SDK detail (often an untranslated English sentence,
  // e.g. "Missing or insufficient permissions.") is intentionally kept off
  // the user-facing message -- it would otherwise mix into an
  // otherwise-Spanish sentence. Keep it here for logging/debugging only.
  readonly detail?: string

  constructor(input: {
    readonly operation: string
    readonly code: string
    readonly detail?: string
  }) {
    const action =
      FIRESTORE_OPERATION_ACTIONS[input.operation] ?? input.operation
    super(`No se pudo ${action}. Volvé a intentar.`)
    this.operation = input.operation
    this.code = input.code
    this.detail = input.detail
  }
}

export class InviteNotFoundError extends Error {
  override readonly name = 'InviteNotFoundError'

  constructor() {
    super('No se encontró la invitación')
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
