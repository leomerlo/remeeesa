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
  // Set when this Expense was created by markPendientePaid (a "servicio" --
  // a recurring or one-off bill paid through Pendientes), null when created
  // directly as a plain Gasto. Lets Histórico tell the two apart.
  readonly pendienteId: string | null
  // A manual "count this as a servicio" override, editable regardless of
  // pendienteId -- the only way to reclassify an Expense that predates
  // pendienteId (or one logged as a plain Gasto that should have gone
  // through Pendientes) without a real Pendiente to link it to. An Expense
  // reads as a servicio in Histórico when either this or pendienteId says so.
  readonly isService: boolean
  readonly createdAt: Date
}
