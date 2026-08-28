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
  listExpensesInMonth(input: {
    readonly householdId: string
    readonly monthStart: Date
    readonly monthEnd: Date
  }): Promise<readonly Expense[]>
}
