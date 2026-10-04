import type { Currency } from '@/lib/money'
import type { Card, CardPurchase } from '@/lib/cards/types'
import type { Pendiente } from '@/lib/pendientes/types'
import type { Category, Expense } from '@/lib/expenses/types'
import type { ExpenseHistoryCursor } from '@/lib/expenses/history'

export type HouseholdDraft = {
  readonly name: string
  readonly monthlyBudget: number
}

export type Household = {
  readonly id: string
  readonly name: string
  // The figure in force now, and the fallback for a household that has no
  // snapshots yet. Read a *month's* budget with monthlyBudgetFor, never
  // this field directly -- see lib/households/monthlyBudget.
  readonly monthlyBudget: number
  // What the budget was in each month it was set, keyed "2026-09". A month
  // with no entry inherits the last one set before it, so leaving the
  // budget alone carries it forward and changing it never rewrites a month
  // that has already been lived.
  readonly monthlyBudgets: Readonly<Record<string, number>>
  readonly createdAt: Date
}

export type HouseholdMember = {
  readonly householdId: string
  readonly userId: string
  readonly joinedAt: Date
  // Set at creation/join time from the member's own auth profile, and
  // self-editable afterward (see updateMemberDisplayName) -- e.g. to
  // correct a membership created before this field existed. A doc missing
  // it (that older case) parses to a generic fallback rather than an
  // error; see parseHouseholdMemberDocument.
  readonly displayName: string
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
    readonly displayName: string
  }): Promise<{ household: Household; member: HouseholdMember }>
  getHousehold(householdId: string): Promise<Household>
  listMembers(householdId: string): Promise<readonly HouseholdMember[]>
  getMembership(userId: string): Promise<HouseholdMember | null>
  // monthlyBudgets is the whole map, recomputed by the caller with the
  // edited month written in -- see withMonthlyBudgetFor. Sent wholesale
  // because it lives on the household document; the edited month is never
  // merged in by the adapter.
  updateMonthlyBudget(input: {
    readonly householdId: string
    readonly monthlyBudget: number
    readonly monthlyBudgets: Readonly<Record<string, number>>
  }): Promise<Household>
  updateHousehold(input: {
    readonly householdId: string
    readonly name: string
    readonly monthlyBudget: number
    readonly monthlyBudgets: Readonly<Record<string, number>>
  }): Promise<Household>
  getOrCreateInvite(input: {
    readonly householdId: string
  }): Promise<HouseholdInvite>
  joinHousehold(input: {
    readonly userId: string
    readonly token: string
    readonly displayName: string
  }): Promise<HouseholdMember>
  leaveHousehold(input: { readonly userId: string }): Promise<void>
  // Self-only: the caller can only ever update their own membership doc
  // (enforced by the userId being the caller's own auth uid at the rules
  // level too, not just here).
  updateMemberDisplayName(input: {
    readonly householdId: string
    readonly userId: string
    readonly displayName: string
  }): Promise<HouseholdMember>
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
  // The category's own ceiling inside the monthly budget. Zero clears it.
  // A plain field update for the same reason color is: the doc id is
  // derived from the name, and this does not touch the name.
  updateCategoryBudget(input: {
    readonly householdId: string
    readonly categoryId: string
    readonly monthlyBudget: number
  }): Promise<Category>
  // Creates a doc at the new name's id (carrying over color and createdAt),
  // repoints every referencing Expense and Pendiente, then deletes the old doc.
  // Rejects -- writing nothing -- when the new name already belongs to another
  // category; that case is a merge, not a rename.
  renameCategory(input: {
    readonly householdId: string
    readonly categoryId: string
    readonly name: string
  }): Promise<Category>
  // Refuses while any Expense or Pendiente still points at the category, so
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
    // Pesos when omitted. A dollar amount is recorded but never counted --
    // see lib/money/currency.
    readonly currency?: Currency
  }): Promise<Expense>
  listExpensesInMonth(input: {
    readonly householdId: string
    readonly monthStart: Date
    readonly monthEnd: Date
  }): Promise<readonly Expense[]>
  // Every expense the household has, newest first, in one query.
  //
  // Only the search uses it. Walking the paged history instead meant a
  // round trip per fifteen rows, each waiting on the one before it -- on a
  // phone that is seconds before the first result appears. A household's
  // whole history is a few hundred rows; that is one query, not a walk.
  listAllExpenses(input: {
    readonly householdId: string
  }): Promise<readonly Expense[]>
  listRecentExpenses(input: {
    readonly householdId: string
    readonly limit: number
  }): Promise<readonly Expense[]>
  // All-time history, newest first, paginated in fixed-size pages of
  // EXPENSE_HISTORY_PAGE_SIZE rows regardless of what calendar month(s)
  // they fall in. `after` is the cursor -- omit it for the first page, then
  // pass back the `nextCursor` of the previous page. `nextCursor` is null
  // once there is nothing older left.
  listExpenseHistoryPage(input: {
    readonly householdId: string
    readonly after?: ExpenseHistoryCursor
  }): Promise<{
    readonly expenses: readonly Expense[]
    readonly nextCursor: ExpenseHistoryCursor | null
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
    readonly memberId: string
    readonly authorDisplayName: string
    readonly isService: boolean
  }): Promise<Expense>
  deleteExpense(input: {
    readonly householdId: string
    readonly expenseId: string
  }): Promise<void>
  createPendiente(input: {
    readonly householdId: string
    readonly categoryId: string
    readonly name: string
    readonly dueDate: Date
    readonly expectedAmount: number | null
    readonly recurring?: boolean
    readonly autoDebit?: boolean
  }): Promise<Pendiente>
  getPendiente(input: {
    readonly householdId: string
    readonly pendienteId: string
  }): Promise<Pendiente | null>
  listPendientes(input: {
    readonly householdId: string
  }): Promise<readonly Pendiente[]>
  // Paid Pendientes are otherwise invisible once marked paid -- listPendientes
  // only ever returns status == 'pending'. This is the one place a paid
  // Pendiente can still be found, scoped by when it was paid (paidAt) rather
  // than its due date, since paying it doesn't change when it was due.
  listPaidPendientesDueInMonth(input: {
    readonly householdId: string
    readonly monthStart: Date
    readonly monthEnd: Date
  }): Promise<readonly Pendiente[]>
  updatePendiente(input: {
    readonly householdId: string
    readonly pendienteId: string
    readonly categoryId: string
    readonly name: string
    readonly dueDate: Date
    readonly expectedAmount: number | null
    readonly recurring: boolean
    readonly autoDebit: boolean
  }): Promise<Pendiente>
  deletePendiente(input: {
    readonly householdId: string
    readonly pendienteId: string
  }): Promise<void>
  markPendientePaid(input: {
    readonly householdId: string
    readonly pendienteId: string
    readonly memberId: string
    readonly authorDisplayName: string
    readonly finalAmount: number
    readonly paymentDate: Date
  }): Promise<{
    pendiente: Pendiente
    expense: Expense
  }>
  // Reverses markPendientePaid or markResumenPaid: restores status to
  // 'pending' and deletes every Expense that payment created (a Resumen's
  // also unlock its purchases).
  unmarkPendientePaid(input: {
    readonly householdId: string
    readonly pendienteId: string
  }): Promise<Pendiente>
  // One transaction, all or nothing: writes one Expense per cuota of the
  // Resumen in tarjetaCategoryId (subcategory = the purchase's category name)
  // plus the ajuste when amountPaid differs from the total (see
  // resumenPayment), marks the Resumen paid, and locks each of its purchases
  // (CardPurchase.paidResumenIds). Rejects with PendienteNotFoundError,
  // ResumenAlreadyPaidError or ResumenNotYetPayableError.
  markResumenPaid(input: {
    readonly householdId: string
    readonly resumenId: string
    readonly memberId: string
    readonly authorDisplayName: string
    readonly amountPaid: number
    readonly paymentDate: Date
    readonly tarjetaCategoryId: string
    // The card's own currency, stamped on every Expense the payment
    // creates. A dollar card's Resumen settles in dollars, and those
    // expenses are recorded without ever reaching the budget.
    readonly currency: Currency
  }): Promise<{
    readonly pendiente: Pendiente
    readonly expenses: readonly Expense[]
  }>
  listCards(input: { readonly householdId: string }): Promise<readonly Card[]>
  createCard(input: {
    readonly householdId: string
    readonly name: string
    readonly currency: Currency
  }): Promise<Card>
  // One batch: the card's name and the name of every Resumen of the card,
  // whatever its status. Rejects with CardNotFoundError for a card outside
  // the household.
  renameCard(input: {
    readonly householdId: string
    readonly cardId: string
    readonly name: string
  }): Promise<Card>
  // Only the card itself: expenses a past Resumen already wrote keep the
  // currency stamped on them, so this changes what the card means from here
  // on and never rewrites what was already settled.
  updateCardCurrency(input: {
    readonly householdId: string
    readonly cardId: string
    readonly currency: Currency
  }): Promise<Card>
  // One transaction: writes the purchase and adds each of its cuotas to the
  // card's Resumen of that month (a Pendiente with id resumenIdFor, created
  // in resumenCategoryId if missing). Rejects -- writing nothing -- with
  // ResumenAlreadyPaidError when any of those Resúmenes is already paid.
  createCardPurchase(input: {
    readonly householdId: string
    readonly cardId: string
    readonly categoryId: string
    readonly resumenCategoryId: string
    readonly memberId: string
    readonly authorDisplayName: string
    readonly name: string
    readonly total: number
    readonly cuotas: number
    readonly purchaseDate: Date
    readonly comments: string
  }): Promise<CardPurchase>
  // One transaction: rewrites the purchase and moves its cuotas between
  // Resúmenes (see resumenChanges), creating a missing one in
  // resumenCategoryId and deleting one left with no purchase. Rejects --
  // writing nothing -- with CardPurchaseNotFoundError, CardNotFoundError, or
  // ResumenAlreadyPaidError when any Resumen it is in before or after is paid.
  // Firestore rules deny reading a purchase outside the caller's household,
  // so there an outsider gets CardPurchaseNotFoundError rather than the
  // memory adapter's HouseholdAccessDeniedError.
  updateCardPurchase(input: {
    readonly householdId: string
    readonly purchaseId: string
    readonly cardId: string
    readonly categoryId: string
    readonly resumenCategoryId: string
    readonly name: string
    readonly total: number
    readonly cuotas: number
    readonly purchaseDate: Date
    readonly comments: string
  }): Promise<CardPurchase>
  // Same transaction and rejections as updateCardPurchase, with no cuotas
  // after.
  deleteCardPurchase(input: {
    readonly householdId: string
    readonly purchaseId: string
  }): Promise<void>
  listCardPurchasesInMonth(input: {
    readonly householdId: string
    readonly monthStart: Date
    readonly monthEnd: Date
  }): Promise<readonly CardPurchase[]>
  // In purchaseIds order. An id with no purchase of this household behind it
  // (missing, or another household's -- rules deny reading those) is
  // skipped rather than failing the whole Resumen -- in Firestore that also
  // means a caller outside the household gets an empty list.
  getCardPurchases(input: {
    readonly householdId: string
    readonly purchaseIds: readonly string[]
  }): Promise<readonly CardPurchase[]>
}
