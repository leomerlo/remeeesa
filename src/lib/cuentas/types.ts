export type CuentaStatus = 'pending' | 'paid'

export type Cuenta = {
  readonly id: string
  readonly householdId: string
  readonly categoryId: string
  readonly name: string
  readonly dueDate: Date
  readonly expectedAmount: number | null
  readonly recurring: boolean
  readonly status: CuentaStatus
  readonly paidExpenseId: string | null
  readonly createdAt: Date
}
