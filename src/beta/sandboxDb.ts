import type { HouseholdsDb } from '@/lib/households'
import type { Category, Expense } from '@/lib/expenses'
import { categoryDocumentId } from '@/lib/expenses'
import type { CardPurchase } from '@/lib/cards'
import type { Pendiente } from '@/lib/pendientes'
import { cuotasOf, resumenIdFor } from '@/lib/cards/cuotas'
import { DEFAULT_CURRENCY } from '@/lib/money'
import type { Currency } from '@/lib/money'
import type { Sandbox, SandboxKind } from './sandbox'

// The beta writes only what the beta invented.
//
// The instruction this enforces, in Flor's words: "no toques absolutamente
// nada de lo que ya existe. Inventar data nueva con fecha de hoy que después
// eliminás. Pero no borres absolutamente nada de lo que ya está
// funcionando." So this is not a read-only guard any more and it is not an
// open door either. Three kinds of call:
//
//   read     -- always allowed.
//   create   -- always allowed: it adds a row and touches nothing. Whatever
//               it brings into existence is claimed, so it can be edited and
//               deleted afterwards.
//   mutate   -- allowed only when every row it would change is one the beta
//               claimed. A real gasto, a real servicio, a real category: the
//               call throws before it reaches the database.
//
// Still an allowlist, for the reason the read-only version was one: a method
// added to HouseholdsDb later stays blocked until somebody classifies it,
// rather than inheriting permission from the shape of its name. And a write
// that touches the household document itself -- its name, its budget, its
// members, its invite -- is in no list at all, because there is no way to
// invent a second household to practise on.

export class SandboxGuardError extends Error {
  readonly method: string

  constructor(method: string) {
    super(
      `La beta no puede usar "${method}": tocaría algo que ya existe en el ` +
        'hogar. Si este método tiene que poder usarse, clasificalo en ' +
        'sandboxDb a propósito.',
    )
    this.name = 'SandboxGuardError'
    this.method = method
  }
}

export class SandboxNotMineError extends Error {
  readonly method: string
  readonly kind: SandboxKind
  readonly id: string

  constructor(method: string, kind: SandboxKind, id: string) {
    super(
      'Esto ya estaba en la base antes de la beta, así que la beta no lo ' +
        `toca (${method}, ${kind} ${id}). Para probar, creá algo nuevo y ` +
        'editá eso.',
    )
    this.name = 'SandboxNotMineError'
    this.method = method
    this.kind = kind
    this.id = id
  }
}

// What the UI says when somebody opens a form over a row that was already
// there. The form is real and it validates; the one thing it will not do is
// write over the household's own data.
export const NOT_MINE_NOTE =
  'Esto ya estaba cargado en el hogar, así que la beta no lo toca. ' +
  'Para probar editar y borrar, agregá algo nuevo y trabajá sobre eso.'

type Args = Record<string, unknown>
type Owned = readonly [SandboxKind, string]

type Rule = {
  // Rows that must already belong to the beta, checked before the call runs.
  readonly requires?: (args: Args) => readonly Owned[]
  // Asked before the call for the handful of methods that create a row only
  // when one is missing. False means the call is about to hand back
  // something that was already in the household, and nothing is claimed.
  readonly isNew?: (args: Args, db: HouseholdsDb) => Promise<boolean>
  // Rows the call brings into existence, claimed once it has succeeded.
  readonly claims?: (args: Args, result: unknown) => readonly Owned[]
  // Rows the call destroys, dropped once it has succeeded.
  readonly releases?: (args: Args, result: unknown) => readonly Owned[]
}

const READ: Rule = {}

function text(args: Args, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value : ''
}

function count(args: Args, key: string): number {
  const value = args[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 1
}

function day(args: Args, key: string): Date {
  const value = args[key]
  return value instanceof Date ? value : new Date()
}

function currencyOf(args: Args): Currency {
  const value = args['currency']
  return value === 'USD' ? 'USD' : DEFAULT_CURRENCY
}

// Every Resumen a purchase's cuotas land in. They are Pendientes like any
// other, created by the purchase when the month has none yet -- so the beta
// has to own them, or it could never delete the statements its own test
// purchase invented.
function resumenesOf(args: Args, dateKey: string): readonly Owned[] {
  const cardId = text(args, 'cardId')
  const cuotas = cuotasOf({
    total: 1,
    cuotas: Math.max(1, Math.trunc(count(args, 'cuotas'))),
    purchaseDate: day(args, dateKey),
  })
  return cuotas.map(
    (cuota) =>
      [
        'pendiente',
        resumenIdFor(cardId, cuota.monthStart, currencyOf(args)),
      ] as const,
  )
}

// A category whose name already exists comes back untouched; a name nobody
// has used is created. The method itself cannot say which of the two
// happened, and the answer decides whether the beta may later rename or
// delete what it got back -- so this asks first. A category's document id is
// derived from its name, which is what makes the question answerable without
// writing anything.
async function categoryIsNew(args: Args, db: HouseholdsDb): Promise<boolean> {
  const householdId = text(args, 'householdId')
  const id = categoryDocumentId({ householdId, name: text(args, 'name') })
  const existing = await db.listCategories(householdId)
  return !existing.some((category) => category.id === id)
}

const RULES: Readonly<Record<string, Rule>> = {
  // -- reads ---------------------------------------------------------------
  getCardPurchases: READ,
  getExpense: READ,
  getHousehold: READ,
  getMembership: READ,
  getPendiente: READ,
  getProjection: READ,
  listAllExpenses: READ,
  listCardPurchasesInMonth: READ,
  listCards: READ,
  listCategories: READ,
  listExpenseHistoryPage: READ,
  listExpensesInMonth: READ,
  listMembers: READ,
  listPaidPendientesDueInMonth: READ,
  listPendientes: READ,
  listRecentExpenses: READ,

  // -- creates -------------------------------------------------------------
  createExpense: {
    claims: (_args, result) => [['expense', (result as Expense).id]],
  },
  createPendiente: {
    claims: (_args, result) => [['pendiente', (result as Pendiente).id]],
  },
  createCard: {
    claims: (_args, result) => [['card', (result as { id: string }).id]],
  },
  findOrCreateCategory: {
    isNew: categoryIsNew,
    claims: (_args, result) => [['category', (result as Category).id]],
  },
  // Buying with a credit card is the one create that is not only a create:
  // the cuotas go into the card's Resumen of each month, and a real card's
  // Resumen is a real row. So this needs the card itself to be one the beta
  // made -- a brand-new card has no statements for anybody but the beta.
  createCardPurchase: {
    requires: (args) => [['card', text(args, 'cardId')]],
    claims: (args, result) => [
      ['purchase', (result as CardPurchase).id],
      ...resumenesOf(args, 'purchaseDate'),
    ],
  },

  // -- mutations, on the beta's own rows only ------------------------------
  updateExpense: {
    requires: (args) => [['expense', text(args, 'expenseId')]],
  },
  deleteExpense: {
    requires: (args) => [['expense', text(args, 'expenseId')]],
    releases: (args) => [['expense', text(args, 'expenseId')]],
  },
  updatePendiente: {
    requires: (args) => [['pendiente', text(args, 'pendienteId')]],
  },
  setPendienteRecurrence: {
    requires: (args) => [['pendiente', text(args, 'pendienteId')]],
  },
  deletePendiente: {
    requires: (args) => [['pendiente', text(args, 'pendienteId')]],
    releases: (args) => [['pendiente', text(args, 'pendienteId')]],
  },
  // Paying a bill writes the Expense the money left as, so the beta owns
  // that too -- otherwise marking a test servicio paid would leave a gasto
  // behind that nothing could delete.
  markPendientePaid: {
    requires: (args) => [['pendiente', text(args, 'pendienteId')]],
    claims: (_args, result) => [
      ['expense', (result as { expense: Expense }).expense.id],
    ],
  },
  markPendientePaidWithCard: {
    requires: (args) => [
      ['pendiente', text(args, 'pendienteId')],
      ['card', text(args, 'cardId')],
    ],
    claims: (args, result) => [
      ['purchase', (result as { purchase: CardPurchase }).purchase.id],
      ...resumenesOf(args, 'paymentDate'),
    ],
  },
  unmarkPendientePaid: {
    requires: (args) => [['pendiente', text(args, 'pendienteId')]],
  },
  markResumenPaid: {
    requires: (args) => [['pendiente', text(args, 'resumenId')]],
    claims: (_args, result) =>
      (result as { expenses: readonly Expense[] }).expenses.map(
        (expense) => ['expense', expense.id] as const,
      ),
  },
  updateCategoryColor: {
    requires: (args) => [['category', text(args, 'categoryId')]],
  },
  updateCategoryBudget: {
    requires: (args) => [['category', text(args, 'categoryId')]],
  },
  // A rename is a new document at the new name's id plus a delete of the
  // old one, so what the beta owns moves with it.
  renameCategory: {
    requires: (args) => [['category', text(args, 'categoryId')]],
    claims: (_args, result) => [['category', (result as Category).id]],
    releases: (args) => [['category', text(args, 'categoryId')]],
  },
  deleteCategory: {
    requires: (args) => [['category', text(args, 'categoryId')]],
    releases: (args) => [['category', text(args, 'categoryId')]],
  },
  updateCard: {
    requires: (args) => [['card', text(args, 'cardId')]],
  },
  renameCard: {
    requires: (args) => [['card', text(args, 'cardId')]],
  },
  updateCardCurrency: {
    requires: (args) => [['card', text(args, 'cardId')]],
  },
  deleteCard: {
    requires: (args) => [['card', text(args, 'cardId')]],
    releases: (args) => [['card', text(args, 'cardId')]],
  },
  updateCardPurchase: {
    requires: (args) => [
      ['purchase', text(args, 'purchaseId')],
      ['card', text(args, 'cardId')],
    ],
    claims: (args) => resumenesOf(args, 'purchaseDate'),
  },
  deleteCardPurchase: {
    requires: (args) => [['purchase', text(args, 'purchaseId')]],
    releases: (args) => [['purchase', text(args, 'purchaseId')]],
  },
}

// Which methods write at all, for anybody that needs to ask without
// calling one.
export function isSandboxWrite(method: string): boolean {
  const rule = RULES[method]
  return rule !== undefined && rule !== READ
}

export const SANDBOX_CLASSIFIED: readonly string[] = Object.keys(RULES)

// Shut on purpose, every one of them for the same reason: there is one
// household and it is the real one. Its name, its budget, its members and
// its invite cannot be practised on, because there is no second household to
// invent. A merge is in here too -- it rewrites rows in the category that
// survives, which is somebody else's data by definition.
//
// Listed rather than simply left out so that the test below can tell a
// decision from an oversight: anything in neither list is a method nobody
// has thought about yet.
export const SANDBOX_REFUSED: readonly string[] = [
  'createHouseholdAndMembership',
  'getOrCreateInvite',
  'joinHousehold',
  'leaveHousehold',
  'mergeCategories',
  'saveProjection',
  'updateHousehold',
  'updateMemberDisplayName',
  'updateMonthlyBudget',
]

// Throws where the call is made rather than rejecting a promise: a rejected
// promise disappears into whatever is handling loading states, and a write
// the beta should not be making has to be impossible to miss. The one it
// does reject with is SandboxNotMineError, which the forms catch and say in
// words -- that one is not a bug, it is the rule working.
export function sandboxDb(db: HouseholdsDb, sandbox: Sandbox): HouseholdsDb {
  return new Proxy(db, {
    get(target, property, receiver): unknown {
      const value: unknown = Reflect.get(target, property, receiver)

      if (typeof value !== 'function' || typeof property !== 'string') {
        return value
      }
      const rule = RULES[property]
      if (rule === undefined) {
        return (): never => {
          throw new SandboxGuardError(property)
        }
      }
      if (rule === READ) {
        return (value as (...args: unknown[]) => unknown).bind(target)
      }

      return async (...args: unknown[]): Promise<unknown> => {
        const input = (args[0] ?? {}) as Args
        for (const [kind, id] of rule.requires?.(input) ?? []) {
          if (!sandbox.owns(kind, id)) {
            throw new SandboxNotMineError(property, kind, id)
          }
        }
        const isNew = (await rule.isNew?.(input, target)) ?? true
        const result: unknown = await (
          value as (...inner: unknown[]) => Promise<unknown>
        ).apply(target, args)
        for (const [kind, id] of isNew
          ? (rule.claims?.(input, result) ?? [])
          : []) {
          sandbox.claim(kind, id)
        }
        for (const [kind, id] of rule.releases?.(input, result) ?? []) {
          sandbox.forget(kind, id)
        }
        return result
      }
    },
  })
}
