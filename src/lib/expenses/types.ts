export type Category = {
  readonly id: string
  readonly householdId: string
  readonly name: string
  readonly color: string
  // A ceiling for this category inside the household's monthly budget --
  // "café", "delivery", "super", so the household knows how much room it
  // has within each. Zero means no ceiling, the same way a household's own
  // monthlyBudget of zero means "sin presupuesto"; most categories never
  // get one. Caps are deliberately not required to add up to the monthly
  // budget: per direct feedback you cap the few that matter and leave the
  // rest alone, and going over the total is a warning, not a refusal.
  readonly monthlyBudget: number
  // Per-month budgets, keyed "2026-04": a month with no key inherits the
  // latest earlier one, and null clears from that month on. Read a month's
  // figure with resolveCategoryBudget, never by indexing this directly.
  // Replaces monthlyBudget once the Categorías screen moves over to it.
  readonly budgets: Readonly<Record<string, number | null>>
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
  // Set only on the Expense paying a card cuota: a snapshot of its purchase's
  // category name, under the "Tarjeta" category. Null everywhere else.
  readonly subcategory: string | null
  readonly createdAt: Date
}
