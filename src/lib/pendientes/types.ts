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
