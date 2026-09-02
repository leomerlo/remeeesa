import type {
  Household,
  HouseholdInvite,
  HouseholdMember,
  HouseholdsDb,
} from './types'
import {
  parseHouseholdName,
  parseMemberDisplayName,
  parseMonthlyBudget,
} from './validate'

// Matches parseHouseholdMemberDocument's own fallback for a membership doc
// with no display_name at all -- keeps "no name given" meaning the same
// thing whether it's a doc predating this field or a caller that didn't
// pass one.
const DEFAULT_MEMBER_DISPLAY_NAME = 'Miembro'

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

// Exported (not just used internally) so a test can walk every operation
// name the Firestore adapter actually calls withHouseholdAccess with and
// confirm each has an entry here -- the failure mode a per-message unit
// test can't catch: a new operation added to the adapter with no matching
// entry falls through to `input.operation` verbatim (see
// FirestoreDeniedError below), which is how "No se pudo
// updateCategoryColor. Volvé a intentar." reached a real screen.
export const FIRESTORE_OPERATION_ACTIONS: Record<string, string> = {
  createHouseholdAndMembership: 'crear el hogar',
  getHousehold: 'cargar el hogar',
  listMembers: 'cargar los integrantes',
  getMembership: 'cargar la membresía',
  updateMonthlyBudget: 'guardar el presupuesto',
  updateHousehold: 'guardar el hogar',
  getOrCreateInvite: 'generar el link de invitación',
  joinHousehold: 'unirse al hogar',
  updateMemberDisplayName: 'guardar tu nombre',
  listCategories: 'cargar las categorías',
  findOrCreateCategory: 'guardar la categoría',
  updateCategoryColor: 'guardar el color de la categoría',
  renameCategory: 'renombrar la categoría',
  deleteCategory: 'borrar la categoría',
  mergeCategories: 'unir las categorías',
  createExpense: 'agregar el gasto',
  listExpensesInMonth: 'cargar los gastos',
  listRecentExpenses: 'cargar los gastos',
  listExpenseHistoryPage: 'cargar el histórico',
  getExpense: 'cargar el gasto',
  updateExpense: 'guardar el gasto',
  deleteExpense: 'eliminar el gasto',
  createPendiente: 'agregar el pendiente',
  getPendiente: 'cargar el pendiente',
  listPendientes: 'cargar los pendientes',
  listPendientesPaidInMonth: 'cargar los pendientes pagados',
  updatePendiente: 'guardar el pendiente',
  deletePendiente: 'eliminar el pendiente',
  markPendientePaid: 'marcar el pendiente como pagado',
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
  // Optional (defaults to the same generic fallback a legacy membership
  // doc parses to) so every existing caller that doesn't care whose name
  // ends up on the seeded membership -- overwhelmingly tests -- keeps
  // compiling unchanged. Real sign-up/join flows always pass the member's
  // actual name.
  readonly displayName?: string
}): Promise<Household> {
  const name = parseHouseholdName(input.name)
  const monthlyBudget = parseMonthlyBudget(input.monthlyBudget)
  const displayName = parseMemberDisplayName(
    input.displayName ?? DEFAULT_MEMBER_DISPLAY_NAME,
  )
  const { household } = await input.db.createHouseholdAndMembership({
    userId: input.userId,
    name,
    monthlyBudget,
    displayName,
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
  // Optional -- see createHouseholdWithMembership's identical parameter.
  readonly displayName?: string
}): Promise<HouseholdMember> {
  const displayName = parseMemberDisplayName(
    input.displayName ?? DEFAULT_MEMBER_DISPLAY_NAME,
  )
  return input.db.joinHousehold({
    userId: input.userId,
    token: input.token,
    displayName,
  })
}

export async function leaveHousehold(input: {
  readonly db: HouseholdsDb
  readonly userId: string
}): Promise<void> {
  await input.db.leaveHousehold({ userId: input.userId })
}

export async function updateMemberDisplayName(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly userId: string
  readonly displayName: string
}): Promise<HouseholdMember> {
  const displayName = parseMemberDisplayName(input.displayName)
  return input.db.updateMemberDisplayName({
    householdId: input.householdId,
    userId: input.userId,
    displayName,
  })
}
