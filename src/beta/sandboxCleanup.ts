import type { HouseholdsDb } from '@/lib/households'
import type { Sandbox, SandboxKind } from './sandbox'

// "Inventar data nueva con fecha de hoy que después eliminás." This is the
// "después eliminás" half, done in one press rather than row by row.
//
// Order is the whole trick, and it is the dependency order the v1 enforces:
// a card cannot go while a purchase or a statement still points at it, and a
// category cannot go while any gasto or servicio is still in it. So the
// leaves go first and the things they hang off go last.
const ORDER: readonly SandboxKind[] = [
  'purchase',
  'expense',
  'pendiente',
  'card',
  'category',
]

export type CleanupResult = {
  readonly removed: number
  // Rows that refused to go -- a category the household has since put a real
  // gasto into, say. They stay claimed, so pressing again retries them.
  readonly left: number
}

export async function cleanSandbox(input: {
  readonly db: HouseholdsDb
  readonly sandbox: Sandbox
  readonly householdId: string
}): Promise<CleanupResult> {
  const { db, sandbox, householdId } = input
  const ledger = sandbox.ledger()
  let removed = 0
  let left = 0

  for (const kind of ORDER) {
    for (const id of ledger[kind]) {
      try {
        await remove(db, householdId, kind, id)
        removed += 1
      } catch {
        // A row that is already gone is a success as far as this is
        // concerned -- the point is that it is not in the household any
        // more. One that is genuinely stuck stays claimed and is counted,
        // so the screen can say so instead of pretending.
        if (await missing(db, householdId, kind, id)) {
          sandbox.forget(kind, id)
          removed += 1
        } else {
          left += 1
        }
      }
    }
  }

  return { removed, left }
}

async function remove(
  db: HouseholdsDb,
  householdId: string,
  kind: SandboxKind,
  id: string,
): Promise<void> {
  switch (kind) {
    case 'purchase':
      return db.deleteCardPurchase({ householdId, purchaseId: id })
    case 'expense':
      return db.deleteExpense({ householdId, expenseId: id })
    case 'pendiente':
      return db.deletePendiente({ householdId, pendienteId: id })
    case 'card':
      return db.deleteCard({ householdId, cardId: id })
    case 'category':
      return db.deleteCategory({ householdId, categoryId: id })
  }
}

// Already gone, by whatever route -- deleted here earlier, deleted from the
// v1, or never written because the call that would have written it failed.
async function missing(
  db: HouseholdsDb,
  householdId: string,
  kind: SandboxKind,
  id: string,
): Promise<boolean> {
  try {
    switch (kind) {
      case 'purchase': {
        const found = await db.getCardPurchases({
          householdId,
          purchaseIds: [id],
        })
        return found.length === 0
      }
      case 'expense':
        return (await db.getExpense({ householdId, expenseId: id })) === null
      case 'pendiente':
        return (
          (await db.getPendiente({ householdId, pendienteId: id })) === null
        )
      case 'card': {
        const cards = await db.listCards({ householdId })
        return !cards.some((card) => card.id === id)
      }
      case 'category': {
        const categories = await db.listCategories(householdId)
        return !categories.some((category) => category.id === id)
      }
    }
  } catch {
    return false
  }
}
