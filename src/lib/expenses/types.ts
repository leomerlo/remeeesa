export type Category = {
  readonly id: string
  readonly householdId: string
  readonly name: string
  readonly color: string
  readonly createdAt: Date
}

export type Expense = {
  readonly id: string
  readonly householdId: string
  readonly categoryId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly name: string
  readonly price: number
  readonly comments: string
  readonly expenseDate: Date
  readonly createdAt: Date
}
