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
  // Color is the one part of a Category that changes in place: a doc's id is
  // derived from its name, so a color swap is a plain field update while a
  // rename is a create-repoint-delete (see renameCategory).
  updateCategoryColor(input: {
    readonly householdId: string
    readonly categoryId: string
    readonly color: string
  }): Promise<Category>
  // Creates a doc at the new name's id (carrying over color and createdAt),
  // repoints every referencing Expense and Cuenta, then deletes the old doc.
  // Rejects -- writing nothing -- when the new name already belongs to another
  // category; that case is a merge, not a rename.
  renameCategory(input: {
    readonly householdId: string
    readonly categoryId: string
    readonly name: string
  }): Promise<Category>
  // Refuses while any Expense or Cuenta still points at the category, so
  // deleting can never orphan a reference.
  deleteCategory(input: {
    readonly householdId: string
    readonly categoryId: string
  }): Promise<void>
  // Repoints everything from the source onto an existing survivor and deletes
  // the source. The survivor's own name and color are left alone.
  mergeCategories(input: {
    readonly householdId: string
    readonly sourceCategoryId: string
    readonly survivorCategoryId: string
  }): Promise<void>
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
  listRecentExpenses(input: {
    readonly householdId: string
    readonly limit: number
  }): Promise<readonly Expense[]>
  // All-time history, newest first, paginated in whole calendar months: a
  // page never ends mid-month, so the Histórico screen can render a month
  // header knowing every expense under it has already arrived.
  // `beforeMonthStart` is the cursor -- omit it for the first page, then
  // pass back the `nextBeforeMonthStart` of the previous page.
  // `nextBeforeMonthStart` is null once there is nothing older left.
  listExpenseHistoryPage(input: {
    readonly householdId: string
    readonly beforeMonthStart?: Date
  }): Promise<{
    readonly expenses: readonly Expense[]
    readonly nextBeforeMonthStart: Date | null
  }>
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
  updateCuenta(input: {
    readonly householdId: string
    readonly cuentaId: string
    readonly categoryId: string
    readonly name: string
    readonly dueDate: Date
    readonly expectedAmount: number | null
    readonly recurring: boolean
  }): Promise<Cuenta>
  deleteCuenta(input: {
    readonly householdId: string
    readonly cuentaId: string
  }): Promise<void>
  markCuentaPaid(input: {
    readonly householdId: string
    readonly cuentaId: string
    readonly memberId: string
    readonly authorDisplayName: string
    readonly finalAmount: number
    readonly paymentDate: Date
    // nextCuenta is the auto-created next cycle for a recurring Cuenta,
    // written in the same transaction; null for a non-recurring one. Declared
    // as `Cuenta | null` rather than an optional property so every adapter has
    // to state the non-recurring case explicitly instead of omitting it.
  }): Promise<{ cuenta: Cuenta; expense: Expense; nextCuenta: Cuenta | null }>
}
