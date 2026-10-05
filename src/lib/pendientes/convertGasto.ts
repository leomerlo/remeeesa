import { DEFAULT_CURRENCY } from '@/lib/money'
import {
  deleteExpense,
  ExpenseNotFoundError,
  updateExpense,
} from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households/types'
import { createPendiente, markPendientePaid } from './pendientes'
import type { Pendiente } from './types'

// Asking a plain gasto to be recurrent, or to go back to being owed, when
// the money it records is in dollars. A Pendiente carries no currency of its
// own -- only a card Resumen does -- so converting one would quietly turn
// US$120 into $120 of this month's budget. Refused instead of rounded off.
export class GastoNotConvertibleCurrencyError extends Error {
  override readonly name = 'GastoNotConvertibleCurrencyError'

  constructor() {
    super(
      'Un gasto en dólares no puede ser recurrente ni volver a quedar impago: los servicios se llevan solo en pesos.',
    )
  }
}

// The gasto is already a servicio -- it has a real Pendiente behind it, and
// that Pendiente is where recurrence and "¿ya se pagó?" live. Changing them
// there is updatePendiente / unmarkPendientePaid, not a conversion.
export class GastoAlreadyServicioError extends Error {
  override readonly name = 'GastoAlreadyServicioError'

  constructor() {
    super('Este gasto ya es un servicio')
  }
}

// Turning Recurrente on, or "Ya lo pagué" off, on a gasto that was logged as
// a plain Expense asks for something an Expense cannot be: only a Pendiente
// carries recurrence, and only a Pendiente can be *owed* rather than spent.
// Rather than fake either on the Expense -- which is what the old "Marcar
// como servicio" flag did, a label with no recurrence behind it -- this
// rebuilds the record as the Pendiente the alta would have created from the
// same answers.
//
// Not a transaction: the new record is written before the old one is
// removed, so an interrupted conversion leaves the gasto twice rather than
// losing it. A duplicate is visible and deletable; a hole is neither.
export async function convertExpenseToPendiente(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly expenseId: string
  readonly recurring: boolean
  readonly autoDebit: boolean
  // False turns the gasto into a bill still owed, which is also the end of
  // it: a pending Pendiente holds no comment and no payment method, because
  // neither exists until someone pays it.
  readonly markPaid: boolean
  readonly memberId: string
  readonly authorDisplayName: string
}): Promise<Pendiente> {
  const existing = await input.db.getExpense({
    householdId: input.householdId,
    expenseId: input.expenseId,
  })
  if (existing === null) {
    throw new ExpenseNotFoundError()
  }
  if (existing.pendienteId !== null) {
    throw new GastoAlreadyServicioError()
  }
  if (existing.currency !== DEFAULT_CURRENCY) {
    throw new GastoNotConvertibleCurrencyError()
  }

  const created = await createPendiente({
    db: input.db,
    householdId: input.householdId,
    categoryId: existing.categoryId,
    name: existing.name,
    // What the gasto was dated becomes what the bill is due: the same day
    // the household already said the money moved.
    dueDate: existing.expenseDate,
    expectedAmount: existing.price,
    recurring: input.recurring,
    autoDebit: input.autoDebit,
  })

  if (input.markPaid) {
    const paid = await markPendientePaid({
      db: input.db,
      householdId: input.householdId,
      pendienteId: created.id,
      memberId: input.memberId,
      authorDisplayName: input.authorDisplayName,
      finalAmount: existing.price,
      paymentDate: existing.expenseDate,
    })
    // markPendientePaid writes a fresh Expense from the Pendiente alone, so
    // the two things the Pendiente never held have to be put back by hand.
    if (existing.comments !== '' || existing.paymentMethodId !== null) {
      await updateExpense({
        db: input.db,
        householdId: input.householdId,
        expenseId: paid.expense.id,
        comments: existing.comments,
        paymentMethodId: existing.paymentMethodId,
      })
    }
  }

  await deleteExpense({
    db: input.db,
    householdId: input.householdId,
    expenseId: input.expenseId,
  })

  return created
}
