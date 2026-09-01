import type { Cuenta } from '@/lib/cuentas/types'
import type { Category, Expense } from '@/lib/expenses/types'

export type HouseholdDraft = {
  readonly name: string
  readonly monthlyBudget: number
}

export type Household = {
  readonly id: string
  readonly name: string
  readonly monthlyBudget: number
  readonly createdAt: Date
}

export type HouseholdMember = {
  readonly householdId: string
  readonly userId: string
  readonly joinedAt: Date
}

export type HouseholdInvite = {
  readonly householdId: string
  readonly token: string
  readonly createdAt: Date
}

export type HouseholdsDb = {
  createHouseholdAndMembership(input: {
    readonly userId: string
    readonly name: string
    readonly monthlyBudget: number
  }): Promise<{ household: Household; member: HouseholdMember }>
  getHousehold(householdId: string): Promise<Household>
  listMembers(householdId: string): Promise<readonly HouseholdMember[]>
  getMembership(userId: string): Promise<HouseholdMember | null>
  updateMonthlyBudget(input: {
    readonly householdId: string
    readonly monthlyBudget: number
  }): Promise<Household>
  updateHousehold(input: {
    readonly householdId: string
    readonly name: string
    readonly monthlyBudget: number
  }): Promise<Household>
  getOrCreateInvite(input: {
    readonly householdId: string
  }): Promise<HouseholdInvite>
  joinHousehold(input: {
    readonly userId: string
    readonly token: string
  }): Promise<HouseholdMember>
  leaveHousehold(input: { readonly userId: string }): Promise<void>
  listCategories(householdId: string): Promise<readonly Category[]>
  findOrCreateCategory(input: {
    readonly householdId: string
    readonly name: string
  }): Promise<Category>
  createExpense(input: {
    readonly householdId: string
    readonly categoryId: string
    readonly memberId: string
    readonly authorDisplayName: string
    readonly name: string
    readonly price: number
    readonly comments: string
    readonly expenseDate: Date
  }): Promise<Expense>
  updateExpense(input: {
    readonly expenseId: string
    readonly householdId: string
    readonly name: string
    readonly price: number
    readonly categoryId: string
    readonly comments: string
    readonly expenseDate: Date
  }): Promise<Expense>
  listExpensesInMonth(input: {
    readonly householdId: string
    readonly monthStart: Date
    readonly monthEnd: Date
  }): Promise<readonly Expense[]>
  listRecentExpenses(input: {
    readonly householdId: string
    readonly limit: number
  }): Promise<readonly Expense[]>
  getExpense(input: {
    readonly householdId: string
    readonly expenseId: string
  }): Promise<Expense | null>
  updateExpense(input: {
    readonly householdId: string
    readonly expenseId: string
    readonly categoryId: string
    readonly name: string
    readonly price: number
    readonly comments: string
    readonly expenseDate: Date
  }): Promise<Expense>
  deleteExpense(input: {
    readonly householdId: string
    readonly expenseId: string
  }): Promise<void>
  createCuenta(input: {
    readonly householdId: string
    readonly categoryId: string
    readonly name: string
    readonly dueDate: Date
    readonly expectedAmount: number | null
    readonly recurring?: boolean
  }): Promise<Cuenta>
  getCuenta(input: {
    readonly householdId: string
    readonly cuentaId: string
  }): Promise<Cuenta | null>
  listPendingCuentas(input: {
    readonly householdId: string
  }): Promise<readonly Cuenta[]>
}
