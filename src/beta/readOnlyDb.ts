import type { HouseholdsDb } from '@/lib/households'

// The beta reads Flor's live household and never writes to it. That is a
// standing instruction, so it is enforced here rather than remembered at
// every call site.
//
// An allowlist, not a denylist. "Anything that does not start with get or
// list is a write" reads like a tidy rule and would have let two methods
// straight through: findOrCreateCategory and getOrCreateInvite both create
// the thing when it is missing. An allowlist also means a method added to
// HouseholdsDb later stays blocked until somebody decides it is a read,
// instead of inheriting permission by the shape of its name.
export const READ_ONLY_METHODS: readonly (keyof HouseholdsDb)[] = [
  'getCardPurchases',
  'getExpense',
  'getHousehold',
  'getMembership',
  'getPendiente',
  'getProjection',
  'listAllExpenses',
  'listCardPurchasesInMonth',
  'listCards',
  'listCategories',
  'listExpenseHistoryPage',
  'listExpensesInMonth',
  'listMembers',
  'listPaidPendientesDueInMonth',
  'listPendientes',
  'listRecentExpenses',
]

export class ReadOnlyDbError extends Error {
  readonly method: string

  constructor(method: string) {
    super(
      `La beta solo lee la base: "${method}" escribe y está bloqueado. ` +
        'Si este método tiene que poder usarse, agregalo a READ_ONLY_METHODS ' +
        'a propósito.',
    )
    this.name = 'ReadOnlyDbError'
    this.method = method
  }
}

// Throws where the write is called rather than rejecting its promise: a
// rejected promise disappears into whatever handles loading states, and
// this is meant to be impossible to miss.
export function readOnlyDb(db: HouseholdsDb): HouseholdsDb {
  const allowed = new Set<string>(READ_ONLY_METHODS)

  return new Proxy(db, {
    get(target, property, receiver): unknown {
      const value: unknown = Reflect.get(target, property, receiver)

      if (typeof value !== 'function' || typeof property !== 'string') {
        return value
      }
      if (allowed.has(property)) {
        return (value as (...args: unknown[]) => unknown).bind(target)
      }
      return (): never => {
        throw new ReadOnlyDbError(property)
      }
    },
  })
}
