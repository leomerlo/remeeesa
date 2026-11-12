import { createExpense } from '@/lib/expenses'
import type { Expense } from '@/lib/expenses/types'
import type { HouseholdsDb } from '@/lib/households/types'
import type { Currency } from '@/lib/money'
import {
  CardPurchaseLockedError,
  CardPurchaseNotFoundError,
  deleteCardPurchase,
} from './purchases'

// The consumo is the payment of a servicio: the bill says "pagado con la
// Visa" and points at this very purchase. Taking it off the card from here
// would leave the bill pointing at nothing, so it is refused and the
// servicio is where it gets changed -- the toggle there undoes the payment
// and lets it be paid again with whatever really paid it.
export class ConsumoFromServicioError extends Error {
  override readonly name = 'ConsumoFromServicioError'

  constructor() {
    super(
      'Este consumo es el pago de un servicio. Para sacarlo de la tarjeta, editá el servicio.',
    )
  }
}

// Taking a consumo off the card: it was logged on the Visa and it was not
// paid with the Visa. Her words: "si me confundí y le quiero sacar que lo
// pagué con tarjeta porque me confundí, lo tengo que poder editar".
//
// A consumo and a gasto are two different records, so this is a conversion
// and not an edit: the purchase leaves its Resúmenes and the same money
// becomes an ordinary gasto of the month it was made in -- which is the
// month it now counts against, because the money really did leave then.
// Every field comes from the form rather than from the stored purchase, so
// a save that also corrects the figure or the date keeps those corrections.
//
// Not a transaction, for the same reason convertExpenseToPendiente is not:
// the gasto is written before the consumo is removed, so an interrupted
// conversion leaves the money twice rather than losing it. A duplicate is
// visible and deletable; a hole is neither.
export async function convertCardPurchaseToExpense(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly purchaseId: string
  readonly categoryId: string
  readonly name: string
  readonly price: number
  readonly comments: string
  readonly expenseDate: Date
  // Whoever is making the correction, as on every other write: the rules
  // only let a member write an Expense in their own name, so the gasto
  // cannot be left in the name of whoever logged the consumo.
  readonly memberId: string
  readonly authorDisplayName: string
  readonly currency?: Currency
  // What really paid for it: one of the household's non-credit methods, or
  // null for cash. Credit is what it is being taken off.
  readonly paymentMethodId: string | null
}): Promise<Expense> {
  const [purchase] = await input.db.getCardPurchases({
    householdId: input.householdId,
    purchaseIds: [input.purchaseId],
  })
  if (purchase === undefined) {
    throw new CardPurchaseNotFoundError()
  }
  // One of its cuotas is in a Resumen that is already paid, so the money
  // has moved and the consumo cannot be unmade. The same lock the edit and
  // the delete have.
  if (purchase.paidResumenIds.length > 0) {
    throw new CardPurchaseLockedError()
  }
  if ((purchase.pendienteId ?? null) !== null) {
    throw new ConsumoFromServicioError()
  }
  const created = await createExpense({
    db: input.db,
    householdId: input.householdId,
    categoryId: input.categoryId,
    memberId: input.memberId,
    authorDisplayName: input.authorDisplayName,
    name: input.name,
    price: input.price,
    comments: input.comments,
    expenseDate: input.expenseDate,
    ...(input.currency === undefined ? {} : { currency: input.currency }),
    paymentMethodId: input.paymentMethodId,
  })
  await deleteCardPurchase({
    db: input.db,
    householdId: input.householdId,
    purchaseId: input.purchaseId,
  })
  return created
}
