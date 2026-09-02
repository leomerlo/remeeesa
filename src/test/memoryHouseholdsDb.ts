import {
  CuentaAlreadyPaidError,
  CuentaNotFoundError,
} from '@/lib/cuentas/cuentas'
import { nextCycleDueDate } from '@/lib/cuentas/recurrence'
import type { Cuenta } from '@/lib/cuentas/types'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import {
  CategoryInUseError,
  CategoryNameTakenError,
  CategoryNotFoundError,
} from '@/lib/expenses/categoryManagement'
import { categoryDocumentId, defaultCategoryRecords } from '@/lib/expenses/seed'
import { parseCategoryColor, parseCategoryName } from '@/lib/expenses/validate'
import { ExpenseNotFoundError } from '@/lib/expenses/expenses'
import { buildExpenseHistoryPage } from '@/lib/expenses/history'
import type { Category, Expense } from '@/lib/expenses/types'
import {
  AlreadyInHouseholdError,
  HouseholdAccessDeniedError,
  InviteNotFoundError,
} from '@/lib/households/households'
import type {
  Household,
  HouseholdInvite,
  HouseholdMember,
  HouseholdsDb,
} from '@/lib/households/types'

type HouseholdRecord = {
  name: string
  monthlyBudget: number
  createdAt: Date
}

type MembershipRecord = {
  householdId: string
  joinedAt: Date
}

type InviteRecord = {
  householdId: string
  createdAt: Date
}

type MemoryState = {
  households: Map<string, HouseholdRecord>
  members: Map<string, MembershipRecord>
  invites: Map<string, InviteRecord>
  categories: Map<string, Category>
  expenses: Map<string, Expense>
  cuentas: Map<string, Cuenta>
}

function toHousehold(id: string, record: HouseholdRecord): Household {
  return {
    id,
    name: record.name,
    monthlyBudget: record.monthlyBudget,
    createdAt: record.createdAt,
  }
}

function ownCategory(
  state: MemoryState,
  input: { readonly householdId: string; readonly categoryId: string },
): Category {
  const category = state.categories.get(input.categoryId)
  if (category === undefined || category.householdId !== input.householdId) {
    throw new CategoryNotFoundError()
  }
  return category
}

// Every place a category id can be stored. Rename and merge both move
// references wholesale, and delete refuses while any of them exist, so the two
// collections are walked from one helper each -- missing one would silently
// orphan Cuentas, which is exactly the bug the delete guard exists to prevent.
function repointReferences(
  state: MemoryState,
  fromCategoryId: string,
  toCategoryId: string,
): void {
  for (const [id, expense] of state.expenses) {
    if (expense.categoryId === fromCategoryId) {
      state.expenses.set(id, { ...expense, categoryId: toCategoryId })
    }
  }
  for (const [id, cuenta] of state.cuentas) {
    if (cuenta.categoryId === fromCategoryId) {
      state.cuentas.set(id, { ...cuenta, categoryId: toCategoryId })
    }
  }
}

function assertNoReferences(state: MemoryState, categoryId: string): void {
  for (const expense of state.expenses.values()) {
    if (expense.categoryId === categoryId) {
      throw new CategoryInUseError()
    }
  }
  // Paid Cuentas count too: they keep pointing at the category forever, so
  // dropping it would leave the Histórico with unlabelled rows.
  for (const cuenta of state.cuentas.values()) {
    if (cuenta.categoryId === categoryId) {
      throw new CategoryInUseError()
    }
  }
}

function assertMemberOf(
  state: MemoryState,
  userId: string,
  householdId: string,
): void {
  const membership = state.members.get(userId)
  if (membership === undefined || membership.householdId !== householdId) {
    throw new HouseholdAccessDeniedError()
  }
}

function dbForUser(state: MemoryState, userId: string): HouseholdsDb {
  return {
    async createHouseholdAndMembership(input) {
      if (input.userId !== userId) {
        throw new HouseholdAccessDeniedError()
      }
      if (state.members.has(input.userId)) {
        throw new AlreadyInHouseholdError()
      }
      const createdAt = new Date()
      const householdId = crypto.randomUUID()
      const household: Household = {
        id: householdId,
        name: input.name,
        monthlyBudget: input.monthlyBudget,
        createdAt,
      }
      const member: HouseholdMember = {
        householdId,
        userId: input.userId,
        joinedAt: createdAt,
      }
      state.households.set(householdId, {
        name: household.name,
        monthlyBudget: household.monthlyBudget,
        createdAt: household.createdAt,
      })
      state.members.set(input.userId, {
        householdId,
        joinedAt: member.joinedAt,
      })
      for (const category of defaultCategoryRecords({
        householdId,
        createdAt,
      })) {
        state.categories.set(category.id, category)
      }
      return { household, member }
    },
    async getHousehold(householdId) {
      assertMemberOf(state, userId, householdId)
      const record = state.households.get(householdId)
      if (record === undefined) {
        throw new Error('Household not found')
      }
      return toHousehold(householdId, record)
    },
    async listMembers(householdId) {
      assertMemberOf(state, userId, householdId)
      const members: HouseholdMember[] = []
      for (const [memberUserId, membership] of state.members) {
        if (membership.householdId === householdId) {
          members.push({
            householdId: membership.householdId,
            userId: memberUserId,
            joinedAt: membership.joinedAt,
          })
        }
      }
      return members
    },
    async getMembership(memberUserId) {
      if (memberUserId !== userId) {
        throw new HouseholdAccessDeniedError()
      }
      const membership = state.members.get(memberUserId)
      if (membership === undefined) {
        return null
      }
      return {
        householdId: membership.householdId,
        userId: memberUserId,
        joinedAt: membership.joinedAt,
      }
    },
    async updateMonthlyBudget(input) {
      assertMemberOf(state, userId, input.householdId)
      const record = state.households.get(input.householdId)
      if (record === undefined) {
        throw new Error('Household not found')
      }
      const updated: Household = {
        id: input.householdId,
        name: record.name,
        monthlyBudget: input.monthlyBudget,
        createdAt: record.createdAt,
      }
      state.households.set(input.householdId, {
        name: updated.name,
        monthlyBudget: updated.monthlyBudget,
        createdAt: updated.createdAt,
      })
      return updated
    },
    async updateHousehold(input) {
      assertMemberOf(state, userId, input.householdId)
      const record = state.households.get(input.householdId)
      if (record === undefined) {
        throw new Error('Household not found')
      }
      const updated: Household = {
        id: input.householdId,
        name: input.name,
        monthlyBudget: input.monthlyBudget,
        createdAt: record.createdAt,
      }
      state.households.set(input.householdId, {
        name: updated.name,
        monthlyBudget: updated.monthlyBudget,
        createdAt: updated.createdAt,
      })
      return updated
    },
    async getOrCreateInvite(input) {
      assertMemberOf(state, userId, input.householdId)
      for (const [token, record] of state.invites) {
        if (record.householdId === input.householdId) {
          return {
            householdId: record.householdId,
            token,
            createdAt: record.createdAt,
          }
        }
      }
      const createdAt = new Date()
      const token = crypto.randomUUID()
      const invite: HouseholdInvite = {
        householdId: input.householdId,
        token,
        createdAt,
      }
      state.invites.set(token, {
        householdId: invite.householdId,
        createdAt: invite.createdAt,
      })
      return invite
    },
    async joinHousehold(input) {
      if (input.userId !== userId) {
        throw new HouseholdAccessDeniedError()
      }
      const invite = state.invites.get(input.token)
      if (invite === undefined) {
        throw new InviteNotFoundError()
      }
      const existing = state.members.get(input.userId)
      if (existing !== undefined) {
        if (existing.householdId === invite.householdId) {
          return {
            householdId: existing.householdId,
            userId: input.userId,
            joinedAt: existing.joinedAt,
          }
        }
        throw new AlreadyInHouseholdError()
      }
      const joinedAt = new Date()
      state.members.set(input.userId, {
        householdId: invite.householdId,
        joinedAt,
      })
      return {
        householdId: invite.householdId,
        userId: input.userId,
        joinedAt,
      }
    },
    async leaveHousehold(input) {
      if (input.userId !== userId) {
        throw new HouseholdAccessDeniedError()
      }
      state.members.delete(input.userId)
    },
    async listCategories(householdId) {
      assertMemberOf(state, userId, householdId)
      const categories: Category[] = []
      for (const category of state.categories.values()) {
        if (category.householdId === householdId) {
          categories.push(category)
        }
      }
      return categories
    },
    async findOrCreateCategory(input) {
      assertMemberOf(state, userId, input.householdId)
      const id = categoryDocumentId({
        householdId: input.householdId,
        name: input.name,
      })
      const existing = state.categories.get(id)
      if (existing !== undefined) {
        return existing
      }
      const category: Category = {
        id,
        householdId: input.householdId,
        name: input.name,
        color: colorForCategoryName(input.name),
        createdAt: new Date(),
      }
      state.categories.set(id, category)
      return category
    },
    async updateCategoryColor(input) {
      assertMemberOf(state, userId, input.householdId)
      const existing = ownCategory(state, input)
      const updated: Category = {
        ...existing,
        color: parseCategoryColor(input.color),
      }
      state.categories.set(existing.id, updated)
      return updated
    },
    async renameCategory(input) {
      assertMemberOf(state, userId, input.householdId)
      const existing = ownCategory(state, input)
      const name = parseCategoryName(input.name)
      const newId = categoryDocumentId({
        householdId: input.householdId,
        name,
      })
      if (newId !== existing.id && state.categories.has(newId)) {
        throw new CategoryNameTakenError()
      }
      // Renaming to the same id (only the casing or spacing changed) is a
      // plain field update: there is no second doc to move anything to.
      const renamed: Category = { ...existing, id: newId, name }
      state.categories.set(newId, renamed)
      if (newId !== existing.id) {
        repointReferences(state, existing.id, newId)
        state.categories.delete(existing.id)
      }
      return renamed
    },
    async deleteCategory(input) {
      assertMemberOf(state, userId, input.householdId)
      const existing = ownCategory(state, input)
      assertNoReferences(state, existing.id)
      state.categories.delete(existing.id)
    },
    async mergeCategories(input) {
      assertMemberOf(state, userId, input.householdId)
      const source = ownCategory(state, {
        householdId: input.householdId,
        categoryId: input.sourceCategoryId,
      })
      const survivor = ownCategory(state, {
        householdId: input.householdId,
        categoryId: input.survivorCategoryId,
      })
      if (source.id === survivor.id) {
        throw new Error('No se puede unir una categoría consigo misma')
      }
      repointReferences(state, source.id, survivor.id)
      state.categories.delete(source.id)
    },
    async createExpense(input) {
      assertMemberOf(state, userId, input.householdId)
      if (input.memberId !== userId) {
        throw new HouseholdAccessDeniedError()
      }
      const category = state.categories.get(input.categoryId)
      if (
        category === undefined ||
        category.householdId !== input.householdId
      ) {
        throw new Error('Category not found')
      }
      const expense: Expense = {
        id: crypto.randomUUID(),
        householdId: input.householdId,
        categoryId: input.categoryId,
        memberId: input.memberId,
        authorDisplayName: input.authorDisplayName,
        name: input.name,
        price: input.price,
        comments: input.comments,
        expenseDate: input.expenseDate,
        createdAt: new Date(),
      }
      state.expenses.set(expense.id, expense)
      return expense
    },
    async listExpensesInMonth(input) {
      assertMemberOf(state, userId, input.householdId)
      const monthStart = input.monthStart.getTime()
      const monthEnd = input.monthEnd.getTime()
      const expenses: Expense[] = []
      for (const expense of state.expenses.values()) {
        const expenseTime = expense.expenseDate.getTime()
        if (
          expense.householdId === input.householdId &&
          expenseTime >= monthStart &&
          expenseTime <= monthEnd
        ) {
          expenses.push(expense)
        }
      }
      expenses.sort((left, right) => {
        const dateDiff =
          right.expenseDate.getTime() - left.expenseDate.getTime()
        if (dateDiff !== 0) {
          return dateDiff
        }
        return right.createdAt.getTime() - left.createdAt.getTime()
      })
      return expenses
    },
    async listRecentExpenses(input) {
      assertMemberOf(state, userId, input.householdId)
      const expenses: Expense[] = []
      for (const expense of state.expenses.values()) {
        if (expense.householdId === input.householdId) {
          expenses.push(expense)
        }
      }
      expenses.sort((left, right) => {
        const dateDiff =
          right.expenseDate.getTime() - left.expenseDate.getTime()
        if (dateDiff !== 0) {
          return dateDiff
        }
        return right.createdAt.getTime() - left.createdAt.getTime()
      })
      return expenses.slice(0, input.limit)
    },
    async listExpenseHistoryPage(input) {
      assertMemberOf(state, userId, input.householdId)
      const expenses: Expense[] = []
      for (const expense of state.expenses.values()) {
        if (
          expense.householdId === input.householdId &&
          (input.beforeMonthStart === undefined ||
            expense.expenseDate.getTime() < input.beforeMonthStart.getTime())
        ) {
          expenses.push(expense)
        }
      }
      expenses.sort((left, right) => {
        const dateDiff =
          right.expenseDate.getTime() - left.expenseDate.getTime()
        if (dateDiff !== 0) {
          return dateDiff
        }
        return right.createdAt.getTime() - left.createdAt.getTime()
      })
      return buildExpenseHistoryPage(expenses, (monthStart) =>
        expenses.some(
          (expense) => expense.expenseDate.getTime() < monthStart.getTime(),
        ),
      )
    },
    async getExpense(input) {
      assertMemberOf(state, userId, input.householdId)
      const expense = state.expenses.get(input.expenseId)
      if (expense === undefined || expense.householdId !== input.householdId) {
        return null
      }
      return expense
    },
    async updateExpense(input) {
      assertMemberOf(state, userId, input.householdId)
      const existing = state.expenses.get(input.expenseId)
      if (
        existing === undefined ||
        existing.householdId !== input.householdId
      ) {
        throw new ExpenseNotFoundError()
      }
      const category = state.categories.get(input.categoryId)
      if (
        category === undefined ||
        category.householdId !== input.householdId
      ) {
        throw new Error('Category not found')
      }
      const updated: Expense = {
        ...existing,
        categoryId: input.categoryId,
        name: input.name,
        price: input.price,
        comments: input.comments,
        expenseDate: input.expenseDate,
      }
      state.expenses.set(input.expenseId, updated)
      return updated
    },
    async deleteExpense(input) {
      assertMemberOf(state, userId, input.householdId)
      const expense = state.expenses.get(input.expenseId)
      if (expense === undefined || expense.householdId !== input.householdId) {
        throw new ExpenseNotFoundError()
      }
      state.expenses.delete(input.expenseId)
    },
    async createCuenta(input) {
      assertMemberOf(state, userId, input.householdId)
      const category = state.categories.get(input.categoryId)
      if (
        category === undefined ||
        category.householdId !== input.householdId
      ) {
        throw new Error('Category not found')
      }
      const cuenta: Cuenta = {
        id: crypto.randomUUID(),
        householdId: input.householdId,
        categoryId: input.categoryId,
        name: input.name,
        dueDate: input.dueDate,
        expectedAmount: input.expectedAmount,
        recurring: input.recurring ?? false,
        status: 'pending',
        paidExpenseId: null,
        createdAt: new Date(),
      }
      state.cuentas.set(cuenta.id, cuenta)
      return cuenta
    },
    async getCuenta(input) {
      assertMemberOf(state, userId, input.householdId)
      const cuenta = state.cuentas.get(input.cuentaId)
      if (cuenta === undefined || cuenta.householdId !== input.householdId) {
        return null
      }
      return cuenta
    },
    async listPendingCuentas(input) {
      assertMemberOf(state, userId, input.householdId)
      const cuentas: Cuenta[] = []
      for (const cuenta of state.cuentas.values()) {
        if (
          cuenta.householdId === input.householdId &&
          cuenta.status === 'pending'
        ) {
          cuentas.push(cuenta)
        }
      }
      cuentas.sort(
        (left, right) => left.dueDate.getTime() - right.dueDate.getTime(),
      )
      return cuentas
    },
    async updateCuenta(input) {
      assertMemberOf(state, userId, input.householdId)
      const existing = state.cuentas.get(input.cuentaId)
      if (
        existing === undefined ||
        existing.householdId !== input.householdId
      ) {
        throw new CuentaNotFoundError()
      }
      // Mirrors firestore.rules' isValidCuentaUpdate() requiring
      // resource.data.status == 'pending' -- keeps this fixture faithful to
      // the real rule even though the domain layer's own pre-check already
      // covers the sequential case today.
      if (existing.status !== 'pending') {
        throw new CuentaAlreadyPaidError()
      }
      const category = state.categories.get(input.categoryId)
      if (
        category === undefined ||
        category.householdId !== input.householdId
      ) {
        throw new Error('Category not found')
      }
      const updated: Cuenta = {
        ...existing,
        categoryId: input.categoryId,
        name: input.name,
        dueDate: input.dueDate,
        expectedAmount: input.expectedAmount,
        recurring: input.recurring,
      }
      state.cuentas.set(input.cuentaId, updated)
      return updated
    },
    async deleteCuenta(input) {
      assertMemberOf(state, userId, input.householdId)
      const existing = state.cuentas.get(input.cuentaId)
      if (
        existing === undefined ||
        existing.householdId !== input.householdId
      ) {
        throw new CuentaNotFoundError()
      }
      // Mirrors firestore.rules' delete rule requiring
      // resource.data.status == 'pending'.
      if (existing.status !== 'pending') {
        throw new CuentaAlreadyPaidError()
      }
      state.cuentas.delete(input.cuentaId)
    },
    async markCuentaPaid(input) {
      assertMemberOf(state, userId, input.householdId)
      // Mirrors createExpense's anti-spoof check: the caller must attribute
      // the generated Expense to themselves, not to another household
      // member. The real Firestore adapter never trusts input.memberId in
      // the first place (it resolves it via awaitAuthenticatedUserId), so
      // this exists to keep the double from allowing a spoof that
      // production never permits.
      if (input.memberId !== userId) {
        throw new HouseholdAccessDeniedError()
      }
      const existing = state.cuentas.get(input.cuentaId)
      if (
        existing === undefined ||
        existing.householdId !== input.householdId
      ) {
        throw new CuentaNotFoundError()
      }
      if (existing.status !== 'pending') {
        throw new CuentaAlreadyPaidError()
      }
      // One instant for every record this call writes, mirroring the real
      // adapter's single hoisted Timestamp.now() -- all of them are created
      // by the same commit.
      const createdAt = new Date()
      const expense: Expense = {
        id: crypto.randomUUID(),
        householdId: input.householdId,
        categoryId: existing.categoryId,
        memberId: input.memberId,
        authorDisplayName: input.authorDisplayName,
        name: existing.name,
        price: input.finalAmount,
        comments: '',
        expenseDate: input.paymentDate,
        createdAt,
      }
      const updated: Cuenta = {
        ...existing,
        status: 'paid',
        paidExpenseId: expense.id,
      }
      // A recurring cuenta spawns its next cycle with a blank expected amount
      // -- the previous cycle's amount is deliberately never carried over.
      const nextCuenta: Cuenta | null = existing.recurring
        ? {
            id: crypto.randomUUID(),
            householdId: existing.householdId,
            categoryId: existing.categoryId,
            name: existing.name,
            dueDate: nextCycleDueDate(existing.dueDate),
            expectedAmount: null,
            recurring: true,
            status: 'pending',
            paidExpenseId: null,
            createdAt,
          }
        : null
      // Every record is built above before any store mutation below, so a
      // throw (e.g. from id generation) can never leave a partial write --
      // mirroring the all-or-nothing guarantee of the real adapter's
      // Firestore transaction.
      state.expenses.set(expense.id, expense)
      state.cuentas.set(input.cuentaId, updated)
      if (nextCuenta !== null) {
        state.cuentas.set(nextCuenta.id, nextCuenta)
      }
      return { cuenta: updated, expense, nextCuenta }
    },
  }
}

export function createMemoryHouseholdsDb(): {
  asUser(userId: string): HouseholdsDb
  seedMembership(input: {
    readonly userId: string
    readonly householdId: string
  }): void
  addMember(input: {
    readonly userId: string
    readonly householdId: string
  }): void
  seedCuenta(cuenta: Cuenta): void
} {
  const state: MemoryState = {
    households: new Map(),
    members: new Map(),
    invites: new Map(),
    categories: new Map(),
    expenses: new Map(),
    cuentas: new Map(),
  }

  return {
    asUser(actingUserId) {
      return dbForUser(state, actingUserId)
    },
    seedMembership(input) {
      if (!state.households.has(input.householdId)) {
        throw new Error('Household not found')
      }
      if (state.members.has(input.userId)) {
        throw new AlreadyInHouseholdError()
      }
      state.members.set(input.userId, {
        householdId: input.householdId,
        joinedAt: new Date(),
      })
    },
    addMember(input) {
      state.members.set(input.userId, {
        householdId: input.householdId,
        joinedAt: new Date(),
      })
    },
    // Test-only escape hatch: createCuenta always writes status 'pending',
    // so this is the only way to get a 'paid' cuenta into the store to
    // verify listPendingCuentas filters it out.
    seedCuenta(cuenta) {
      state.cuentas.set(cuenta.id, cuenta)
    },
  }
}
