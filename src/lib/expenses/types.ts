import type { Currency } from '@/lib/money'

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
  // Pesos unless it says otherwise. A dollar amount is recorded and shown
  // but never counted: see lib/money/currency for why no rate is applied.
  readonly currency: Currency
  // Which of the household's payment methods this was paid with, when it
  // was one of the ones they have written down. Null for cash -- the
  // built-in method every household has without creating it -- and for
  // every Expense logged before methods existed. A credit method never
  // appears here: paying with credit books a CardPurchase instead, and the
  // Expense only arrives when its Resumen is paid.
  readonly paymentMethodId: string | null
  readonly createdAt: Date
}
