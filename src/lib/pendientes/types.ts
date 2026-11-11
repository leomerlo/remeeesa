import type { Currency } from '@/lib/money'

export type PendienteStatus = 'pending' | 'paid'

export type Pendiente = {
  readonly id: string
  readonly householdId: string
  readonly categoryId: string
  readonly name: string
  readonly dueDate: Date
  // What the household owes, and therefore what counts against the month.
  // Null means "not known yet", and nothing counts a null: a bill whose
  // amount has not arrived cannot be budgeted for.
  //
  // On a Resumen this is the figure the card actually billed, loaded by
  // hand when the statement closes -- see estimatedAmount for why it is
  // not the app's own running total. Per direct feedback: "no se tiene que
  // sumar automáticamente".
  readonly expectedAmount: number | null
  readonly recurring: boolean
  // What this bill is normally paid with: a card the household wrote
  // down, or null for cash. On a débito automático it is the account or
  // card the bank actually debits, which is the case it exists for -- the
  // bank pays the luz with a particular card every month, and nobody is
  // there to choose at the time.
  //
  // It is what the bill is *expected* to be paid with, never a record of
  // a payment: the payment writes its own method onto the gasto (or books
  // a consumo on the card), and a bill paid in cash one month is still
  // the same bill. Absent on everything written before this field.
  readonly paymentMethodId?: string | null
  // The household does not pay this one: the bank debits it on its own. It
  // still lives here as a Pendiente so the money is budgeted before it
  // leaves, but it settles itself once the due date passes rather than
  // waiting for someone to press Pagar. See lib/pendientes/autoDebit.
  readonly autoDebit: boolean
  readonly status: PendienteStatus
  readonly paidExpenseId: string | null
  // Set instead of paidExpenseId when this bill was paid with a credit
  // card: the money does not leave this month, it goes onto the card and
  // arrives in that card's Resumen, so what the payment created is a
  // CardPurchase and not an Expense. Absent on every other Pendiente --
  // which is almost all of them. Per direct feedback: pagar la Luz con la
  // Visa no es plata que salió hoy.
  readonly paidPurchaseId?: string | null
  // What has already been handed over on a bill that is still pending:
  // the household went to pay the Luz, did not take the whole figure, and
  // put down part of it. Absent on every bill nobody has done that to,
  // which is almost all of them. Each of those payments is a real Gasto
  // of its own (partialExpenseIds, newest last) -- the money left, so the
  // month counts it like any other -- and what the bill still owes is
  // expectedAmount minus this. See lib/pendientes/amountLeft.
  //
  // Never on a Resumen: a card's bill is an estimate until it is paid,
  // and what Flor actually pays she writes down as a servicio of its own.
  // Per direct feedback: "el resumen de la tarjeta, olvidate".
  readonly paidSoFar?: number
  readonly partialExpenseIds?: readonly string[]
  // Set to the payment date when markPendientePaid runs, otherwise null.
  // Lets a paid Pendiente be found by *when it was paid* (e.g. "paid this
  // month") without having to look up its linked Expense.
  readonly paidAt: Date | null
  readonly createdAt: Date
  // Set only on a Resumen: the monthly bill of a card.
  readonly cardId?: string
  readonly purchaseIds?: readonly string[]
  // Set only on a Resumen: what the cuotas in purchaseIds landing in this
  // month add up to. The app's own running total of what the household has
  // been logging -- an estimate of the bill, never the bill. It counts
  // towards nothing and is never paid; it is there to be compared with
  // expectedAmount once the statement arrives, so the household can see
  // how far off its own record was. Per direct feedback.
  readonly estimatedAmount?: number
  // Set only on a Resumen: which of the card's currencies this one settles.
  // A both-currencies card has two Resúmenes per month, and this is what
  // tells them apart -- including what currency paying it records.
  readonly currency?: Currency
  // Every Expense paying a Resumen created (one per cuota, plus the ajuste);
  // paidExpenseId is the first of them.
  readonly paidExpenseIds?: readonly string[]
}
