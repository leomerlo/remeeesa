export type PendienteStatus = 'pending' | 'paid'

export type Pendiente = {
  readonly id: string
  readonly householdId: string
  readonly categoryId: string
  readonly name: string
  readonly dueDate: Date
  readonly expectedAmount: number | null
  readonly recurring: boolean
  readonly status: PendienteStatus
  readonly paidExpenseId: string | null
  // Set to the payment date when markPendientePaid runs, otherwise null.
  // Lets a paid Pendiente be found by *when it was paid* (e.g. "paid this
  // month") without having to look up its linked Expense.
  readonly paidAt: Date | null
  readonly createdAt: Date
}
