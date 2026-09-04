import {
  PendienteAlreadyPaidError,
  PendienteNotFoundError,
  PendienteNotPaidError,
} from '@/lib/pendientes/pendientes'
import { nextCycleDueDate } from '@/lib/pendientes/recurrence'
import type { Pendiente } from '@/lib/pendientes/types'
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
  displayName: string
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
  pendientes: Map<string, Pendiente>
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
// orphan Pendientes, which is exactly the bug the delete guard exists to prevent.
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
  for (const [id, pendiente] of state.pendientes) {
    if (pendiente.categoryId === fromCategoryId) {
      state.pendientes.set(id, { ...pendiente, categoryId: toCategoryId })
    }
  }
}

function assertNoReferences(state: MemoryState, categoryId: string): void {
  for (const expense of state.expenses.values()) {
    if (expense.categoryId === categoryId) {
      throw new CategoryInUseError()
    }
  }
  // Paid Pendientes count too: they keep pointing at the category forever, so
  // dropping it would leave the Histórico with unlabelled rows.
  for (const pendiente of state.pendientes.values()) {
    if (pendiente.categoryId === categoryId) {
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
        displayName: input.displayName,
      }
      state.households.set(householdId, {
        name: household.name,
        monthlyBudget: household.monthlyBudget,
        createdAt: household.createdAt,
      })
      state.members.set(input.userId, {
        householdId,
        joinedAt: member.joinedAt,
        displayName: member.displayName,
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
            displayName: membership.displayName,
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
        displayName: membership.displayName,
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
            displayName: existing.displayName,
          }
        }
        throw new AlreadyInHouseholdError()
      }
      const joinedAt = new Date()
      state.members.set(input.userId, {
        householdId: invite.householdId,
        joinedAt,
        displayName: input.displayName,
      })
      return {
        householdId: invite.householdId,
        userId: input.userId,
        joinedAt,
        displayName: input.displayName,
      }
    },
    async leaveHousehold(input) {
      if (input.userId !== userId) {
        throw new HouseholdAccessDeniedError()
      }
      state.members.delete(input.userId)
    },
    async updateMemberDisplayName(input) {
      if (input.userId !== userId) {
        throw new HouseholdAccessDeniedError()
      }
      const existing = state.members.get(input.userId)
      if (existing === undefined) {
        throw new Error('No se encontró la membresía')
      }
      state.members.set(input.userId, {
        ...existing,
        displayName: input.displayName,
      })
      return {
        householdId: existing.householdId,
        userId: input.userId,
        joinedAt: existing.joinedAt,
        displayName: input.displayName,
      }
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
        pendienteId: null,
        isService: false,
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
      const after = input.after
      const expenses: Expense[] = []
      for (const expense of state.expenses.values()) {
        if (expense.householdId !== input.householdId) {
          continue
        }
        // Strictly older than the cursor, by the same (expense_date desc,
        // created_at desc) ordering the sort below applies.
        if (
          after !== undefined &&
          !(
            expense.expenseDate.getTime() < after.expenseDate.getTime() ||
            (expense.expenseDate.getTime() === after.expenseDate.getTime() &&
              expense.createdAt.getTime() < after.createdAt.getTime())
          )
        ) {
          continue
        }
        expenses.push(expense)
      }
      expenses.sort((left, right) => {
        const dateDiff =
          right.expenseDate.getTime() - left.expenseDate.getTime()
        if (dateDiff !== 0) {
          return dateDiff
        }
        return right.createdAt.getTime() - left.createdAt.getTime()
      })
      return buildExpenseHistoryPage(expenses)
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
        memberId: input.memberId,
        authorDisplayName: input.authorDisplayName,
        isService: input.isService,
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
    async createPendiente(input) {
      assertMemberOf(state, userId, input.householdId)
      const category = state.categories.get(input.categoryId)
      if (
        category === undefined ||
        category.householdId !== input.householdId
      ) {
        throw new Error('Category not found')
      }
      const pendiente: Pendiente = {
        id: crypto.randomUUID(),
        householdId: input.householdId,
        categoryId: input.categoryId,
        name: input.name,
        dueDate: input.dueDate,
        expectedAmount: input.expectedAmount,
        recurring: input.recurring ?? false,
        status: 'pending',
        paidExpenseId: null,
        paidAt: null,
        createdAt: new Date(),
      }
      state.pendientes.set(pendiente.id, pendiente)
      return pendiente
    },
    async getPendiente(input) {
      assertMemberOf(state, userId, input.householdId)
      const pendiente = state.pendientes.get(input.pendienteId)
      if (
        pendiente === undefined ||
        pendiente.householdId !== input.householdId
      ) {
        return null
      }
      return pendiente
    },
    async listPendientes(input) {
      assertMemberOf(state, userId, input.householdId)
      const pendientes: Pendiente[] = []
      for (const pendiente of state.pendientes.values()) {
        if (
          pendiente.householdId === input.householdId &&
          pendiente.status === 'pending'
        ) {
          pendientes.push(pendiente)
        }
      }
      pendientes.sort(
        (left, right) => left.dueDate.getTime() - right.dueDate.getTime(),
      )
      return pendientes
    },
    async listPendientesPaidInMonth(input) {
      assertMemberOf(state, userId, input.householdId)
      const pendientes: Pendiente[] = []
      for (const pendiente of state.pendientes.values()) {
        if (
          pendiente.householdId === input.householdId &&
          pendiente.status === 'paid' &&
          pendiente.paidAt !== null &&
          pendiente.paidAt >= input.monthStart &&
          pendiente.paidAt <= input.monthEnd
        ) {
          pendientes.push(pendiente)
        }
      }
      pendientes.sort(
        (left, right) =>
          (right.paidAt?.getTime() ?? 0) - (left.paidAt?.getTime() ?? 0),
      )
      return pendientes
    },
    async updatePendiente(input) {
      assertMemberOf(state, userId, input.householdId)
      const existing = state.pendientes.get(input.pendienteId)
      if (
        existing === undefined ||
        existing.householdId !== input.householdId
      ) {
        throw new PendienteNotFoundError()
      }
      // Mirrors firestore.rules' isValidPendienteUpdate() requiring
      // resource.data.status == 'pending' -- keeps this fixture faithful to
      // the real rule even though the domain layer's own pre-check already
      // covers the sequential case today.
      if (existing.status !== 'pending') {
        throw new PendienteAlreadyPaidError()
      }
      const category = state.categories.get(input.categoryId)
      if (
        category === undefined ||
        category.householdId !== input.householdId
      ) {
        throw new Error('Category not found')
      }
      const updated: Pendiente = {
        ...existing,
        categoryId: input.categoryId,
        name: input.name,
        dueDate: input.dueDate,
        expectedAmount: input.expectedAmount,
        recurring: input.recurring,
      }
      state.pendientes.set(input.pendienteId, updated)
      return updated
    },
    async deletePendiente(input) {
      assertMemberOf(state, userId, input.householdId)
      const existing = state.pendientes.get(input.pendienteId)
      if (
        existing === undefined ||
        existing.householdId !== input.householdId
      ) {
        throw new PendienteNotFoundError()
      }
      // Mirrors firestore.rules' delete rule requiring
      // resource.data.status == 'pending'.
      if (existing.status !== 'pending') {
        throw new PendienteAlreadyPaidError()
      }
      state.pendientes.delete(input.pendienteId)
    },
    async markPendientePaid(input) {
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
      const existing = state.pendientes.get(input.pendienteId)
      if (
        existing === undefined ||
        existing.householdId !== input.householdId
      ) {
        throw new PendienteNotFoundError()
      }
      if (existing.status !== 'pending') {
        throw new PendienteAlreadyPaidError()
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
        pendienteId: input.pendienteId,
        isService: false,
        createdAt,
      }
      const updated: Pendiente = {
        ...existing,
        status: 'paid',
        paidExpenseId: expense.id,
        paidAt: input.paymentDate,
      }
      // A recurring pendiente spawns its next cycle with the amount just
      // paid pre-filled -- most recurring bills cost the same next cycle
      // too, so this is an editable pre-fill, not a stale carried-over value.
      const nextPendiente: Pendiente | null = existing.recurring
        ? {
            id: crypto.randomUUID(),
            householdId: existing.householdId,
            categoryId: existing.categoryId,
            name: existing.name,
            dueDate: nextCycleDueDate(existing.dueDate),
            expectedAmount: input.finalAmount,
            recurring: true,
            status: 'pending',
            paidExpenseId: null,
            paidAt: null,
            createdAt,
          }
        : null
      // Every record is built above before any store mutation below, so a
      // throw (e.g. from id generation) can never leave a partial write --
      // mirroring the all-or-nothing guarantee of the real adapter's
      // Firestore transaction.
      state.expenses.set(expense.id, expense)
      state.pendientes.set(input.pendienteId, updated)
      if (nextPendiente !== null) {
        state.pendientes.set(nextPendiente.id, nextPendiente)
      }
      return { pendiente: updated, expense, nextPendiente }
    },
    async unmarkPendientePaid(input) {
      assertMemberOf(state, userId, input.householdId)
      const existing = state.pendientes.get(input.pendienteId)
      if (
        existing === undefined ||
        existing.householdId !== input.householdId
      ) {
        throw new PendienteNotFoundError()
      }
      if (existing.status !== 'paid') {
        throw new PendienteNotPaidError()
      }
      // Mirrors the real adapter: the Expense that payment created is
      // deleted outright, not just unlinked.
      if (existing.paidExpenseId !== null) {
        state.expenses.delete(existing.paidExpenseId)
      }
      const updated: Pendiente = {
        ...existing,
        status: 'pending',
        paidExpenseId: null,
        paidAt: null,
      }
      state.pendientes.set(input.pendienteId, updated)
      return updated
    },
  }
}

export function createMemoryHouseholdsDb(): {
  asUser(userId: string): HouseholdsDb
  seedMembership(input: {
    readonly userId: string
    readonly householdId: string
    readonly displayName?: string
  }): void
  addMember(input: {
    readonly userId: string
    readonly householdId: string
    readonly displayName?: string
  }): void
  seedPendiente(pendiente: Pendiente): void
} {
  const state: MemoryState = {
    households: new Map(),
    members: new Map(),
    invites: new Map(),
    categories: new Map(),
    expenses: new Map(),
    pendientes: new Map(),
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
        displayName: input.displayName ?? 'Miembro',
      })
    },
    addMember(input) {
      state.members.set(input.userId, {
        householdId: input.householdId,
        joinedAt: new Date(),
        displayName: input.displayName ?? 'Miembro',
      })
    },
    // Test-only escape hatch: createPendiente always writes status 'pending',
    // so this is the only way to get a 'paid' pendiente into the store to
    // verify listPendientes filters it out.
    seedPendiente(pendiente) {
      state.pendientes.set(pendiente.id, pendiente)
    },
  }
}
