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
  readonly createdAt: Date
}
