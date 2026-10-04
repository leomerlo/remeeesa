import { countedByBudget, DEFAULT_CURRENCY } from '@/lib/money'
import type { Currency } from '@/lib/money'
import { colorForCategoryName } from './categoryColor'
import type { Category, Expense } from './types'

export type CategorySummary = {
  readonly categoryId: string
  readonly name: string
  readonly color: string
  readonly total: number
  // What the category took in dollars over the same period, kept apart
  // rather than converted: there is no rate the app is willing to pick (see
  // lib/money/currency), and a household that spent US$45 on something
  // should see that said, not silently dropped. Per direct feedback -- the
  // two currencies are shown side by side everywhere a total is.
  readonly totalUsd: number
  // Fraction of the period's *peso* spend, 0..1. Computed here rather than
  // in the chart so the number the chart draws and the number the list
  // prints can never disagree. A category with only dollar spend is still
  // listed, with a share of zero -- it took nothing out of the budget the
  // donut is dividing up.
  readonly share: number
}

const UNKNOWN_CATEGORY_NAME = 'Categoría desconocida'

// Groups expenses by categoryId and sums their price. An expense whose
// categoryId has no matching entry in `categories` (e.g. the category was
// deleted after the expense was recorded) falls back to the same
// colorForCategoryName hashing RecentExpensesList.tsx already uses for unknown
// categories, keeping the swatch deterministic instead of blank.
//
// Sort is descending by total; Array#prototype.sort is stable, so a tie
// keeps the order in which each category's first expense was encountered
// in the input array.
//
// `pendientes` (optional) folds still-unpaid bills into their own category's
// total, so this breakdown reconciles with a "Gastos del mes" that also
// counts them -- per direct feedback. Unlike a person, a Pendiente always
// carries a categoryId, so it can be attributed here. The caller narrows
// them to the period first (pendientesDueInMonth); one with no expected
// amount yet contributes nothing, since there's no number to add. Typed
// structurally rather than as Pendiente to keep lib/expenses from importing
// lib/pendientes, which already imports this module.
export function summarizeByCategory(input: {
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
  readonly pendientes?: readonly {
    readonly categoryId: string
    readonly expectedAmount: number | null
    // Absent on anything written before a card could hold two currencies,
    // which was a peso one. A dollar Pendiente is left out of this peso
    // breakdown, like every other dollar amount.
    readonly currency?: Currency
  }[]
}): readonly CategorySummary[] {
  const categoryById = new Map(
    input.categories.map((category) => [category.id, category]),
  )
  const totals = new Map<
    string,
    { name: string; color: string; total: number; totalUsd: number }
  >()

  function add(categoryId: string, amount: number, currency: Currency): void {
    const category = categoryById.get(categoryId)
    const name = category?.name ?? UNKNOWN_CATEGORY_NAME
    const color = category?.color ?? colorForCategoryName(name)
    const existing = totals.get(categoryId) ?? {
      name,
      color,
      total: 0,
      totalUsd: 0,
    }
    if (currency === DEFAULT_CURRENCY) {
      existing.total += amount
    } else {
      existing.totalUsd += amount
    }
    totals.set(categoryId, existing)
  }

  for (const expense of input.expenses) {
    add(expense.categoryId, expense.price, expense.currency)
  }
  for (const pendiente of input.pendientes ?? []) {
    if (pendiente.expectedAmount !== null) {
      add(
        pendiente.categoryId,
        pendiente.expectedAmount,
        pendiente.currency ?? DEFAULT_CURRENCY,
      )
    }
  }

  // Guard the divide: a period with no expenses (or, defensively, one whose
  // prices sum to 0) yields shares of 0 rather than NaN reaching the chart's
  // geometry, where it would silently render nothing.
  let grandTotal = 0
  for (const entry of totals.values()) {
    grandTotal += entry.total
  }

  return (
    Array.from(totals.entries())
      .map(([categoryId, entry]) => ({
        categoryId,
        ...entry,
        share: grandTotal > 0 ? entry.total / grandTotal : 0,
      }))
      // By pesos, then by dollars: the budget is in pesos, so that is the
      // order the list is read in, and a dollars-only category sorts among
      // the zeroes rather than above everything.
      .sort(
        (left, right) =>
          right.total - left.total || right.totalUsd - left.totalUsd,
      )
  )
}

// Which of the three things a line in the Tarjeta breakdown is. They are
// not the same kind of money and the screen must not let them read as one:
// 'pagado' already left the household, 'sinPagar' is a bill that arrived
// and is owed, and 'estimado' is the household's own running record of
// consumos whose statement has not come yet -- it counts towards nothing.
// Per direct feedback: tiene que quedar muy en claro esa identificación.
export type TarjetaLineKind = 'pagado' | 'sinPagar' | 'estimado'

export type TarjetaLine = {
  readonly name: string
  readonly total: number
  readonly kind: TarjetaLineKind
}

// The Tarjeta slice opened up: its paid cuotas by the purchase's category
// (Expense.subcategory), largest first, then the ajuste (subcategory null),
// then the month's bills that arrived and are still owed, and last the
// ones whose statement has not come -- which are an estimate and count
// towards nothing.
//
// Only the 'pagado' and 'sinPagar' lines add up to the slice's total in
// summarizeByCategory, given the same input; an 'estimado' line is
// deliberately outside it, which is the whole distinction.
//
// Per the design, every null subcategory is "Ajuste": a gasto logged by hand
// under Tarjeta lands there too, an accepted mislabel.
export function summarizeTarjeta(input: {
  readonly categoryId: string
  readonly expenses: readonly Expense[]
  readonly pendientes: readonly {
    readonly categoryId: string
    readonly expectedAmount: number | null
    // What the cuotas logged against the card add up to, for a Resumen
    // whose statement has not arrived.
    readonly estimatedAmount?: number
    // Same as summarizeByCategory's: absent means pesos, and a dollar
    // Resumen is left out. Without this these lines added up to more than
    // the slice they break down, on exactly the card this app added
    // two-currency support for.
    readonly currency?: Currency
  }[]
}): readonly TarjetaLine[] {
  const bySubcategory = new Map<string, number>()
  let ajuste: number | null = null
  for (const expense of countedByBudget(input.expenses)) {
    if (expense.categoryId !== input.categoryId) continue
    if (expense.subcategory === null) {
      ajuste = (ajuste ?? 0) + expense.price
    } else {
      bySubcategory.set(
        expense.subcategory,
        (bySubcategory.get(expense.subcategory) ?? 0) + expense.price,
      )
    }
  }
  let unpaid: number | null = null
  let estimated: number | null = null
  const countedPendientes = countedByBudget(
    input.pendientes.map((pendiente) => ({
      ...pendiente,
      currency: pendiente.currency ?? DEFAULT_CURRENCY,
    })),
  )
  for (const pendiente of countedPendientes) {
    if (pendiente.categoryId !== input.categoryId) {
      continue
    }
    if (pendiente.expectedAmount !== null) {
      unpaid = (unpaid ?? 0) + pendiente.expectedAmount
    } else if ((pendiente.estimatedAmount ?? 0) > 0) {
      estimated = (estimated ?? 0) + (pendiente.estimatedAmount ?? 0)
    }
  }
  return [
    ...Array.from(bySubcategory, ([name, total]) => ({
      name,
      total,
      kind: 'pagado' as const,
    })).sort((left, right) => right.total - left.total),
    ...(ajuste === null
      ? []
      : [{ name: 'Ajuste', total: ajuste, kind: 'pagado' as const }]),
    ...(unpaid === null
      ? []
      : // The group heading says it already arrived and is owed, so the
        // line says what it is rather than repeating it.
        [{ name: 'Resumen', total: unpaid, kind: 'sinPagar' as const }]),
    ...(estimated === null
      ? []
      : [
          {
            name: 'Consumos cargados',
            total: estimated,
            kind: 'estimado' as const,
          },
        ]),
  ]
}
