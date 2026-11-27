import { createCardPurchase, markPendientePaidWithCard } from '@/lib/cards'
import { createExpense, findOrCreateCategory } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { createPendiente, markPendientePaid } from '@/lib/pendientes'
import type { PlannedRow } from './plan'

export type ImportResult = {
  readonly written: number
  // A row that failed on the way in, by line, so the screen can say which
  // one and the rest of the file still counts as imported. Nothing is
  // rolled back: a half-finished import leaves real movements behind, and
  // telling the household which ones are missing is more use than
  // pretending the whole file bounced.
  readonly failed: readonly {
    readonly line: number
    readonly message: string
  }[]
}

// Writing a planned file, one row at a time.
//
// The branches are GastoSheet's own, for a record that does not exist yet
// -- a servicio is a Pendiente settled on the spot when it was already
// paid, a consumo goes onto the card, and everything else is a gasto. The
// form and the importer have to agree about this or the same row would
// mean two different things depending on how it was typed.
export async function runImport({
  db,
  householdId,
  memberId,
  authorDisplayName,
  rows,
}: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly rows: readonly PlannedRow[]
}): Promise<ImportResult> {
  // A category named by the file and not by the household exists once,
  // however many rows ask for it: resolving per row would race itself and
  // leave two categories with the same name.
  const created = new Map<string, string>()
  const resolveCategory = async (row: PlannedRow): Promise<string> => {
    if (row.categoryId !== null) return row.categoryId
    const name = row.newCategoryName ?? ''
    const already = created.get(name)
    if (already !== undefined) return already
    const category = await findOrCreateCategory({ db, householdId, name })
    created.set(name, category.id)
    return category.id
  }

  const failed: { line: number; message: string }[] = []
  let written = 0

  for (const row of rows) {
    try {
      const categoryId = await resolveCategory(row)
      if (row.kind === 'servicio') {
        const bill = await createPendiente({
          db,
          householdId,
          categoryId,
          name: row.name,
          dueDate: row.date,
          expectedAmount: row.amount,
          recurring: row.recurring,
          autoDebit: row.autoDebit,
          paymentMethodId: row.methodId,
          currency: row.currency,
        })
        if (row.paid && row.amount !== null) {
          if (row.methodOnCredit) {
            await markPendientePaidWithCard({
              db,
              householdId,
              pendienteId: bill.id,
              cardId: row.methodId ?? '',
              memberId,
              authorDisplayName,
              finalAmount: row.amount,
              cuotas: row.cuotas,
              paymentDate: row.date,
              currency: row.currency,
            })
          } else {
            await markPendientePaid({
              db,
              householdId,
              pendienteId: bill.id,
              memberId,
              authorDisplayName,
              finalAmount: row.amount,
              paymentDate: row.date,
              paymentMethodId: row.methodId,
            })
          }
        }
      } else if (row.kind === 'consumo') {
        await createCardPurchase({
          db,
          householdId,
          cardId: row.methodId ?? '',
          categoryId,
          memberId,
          authorDisplayName,
          name: row.name,
          total: row.amount ?? 0,
          cuotas: row.cuotas,
          purchaseDate: row.date,
          comments: row.comments,
          currency: row.currency,
        })
      } else {
        await createExpense({
          db,
          householdId,
          categoryId,
          memberId,
          authorDisplayName,
          name: row.name,
          price: row.amount ?? 0,
          comments: row.comments,
          expenseDate: row.date,
          currency: row.currency,
          paymentMethodId: row.methodId,
        })
      }
      written += 1
    } catch (error) {
      failed.push({
        line: row.line,
        message: error instanceof Error ? error.message : 'No se pudo guardar',
      })
    }
  }

  return { written, failed }
}
