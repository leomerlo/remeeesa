import { colorForCategoryName } from './categoryColor'
import type { Category, Expense } from './types'

export type CategorySummary = {
  readonly categoryId: string
  readonly name: string
  readonly color: string
  readonly total: number
  // Fraction of the period's total spend, 0..1. Computed here rather than in
  // the chart so the number the chart draws and the number the list prints
  // can never disagree.
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
  }[]
}): readonly CategorySummary[] {
  const categoryById = new Map(
    input.categories.map((category) => [category.id, category]),
  )
  const totals = new Map<
    string,
    { name: string; color: string; total: number }
  >()

  function add(categoryId: string, amount: number): void {
    const category = categoryById.get(categoryId)
    const name = category?.name ?? UNKNOWN_CATEGORY_NAME
    const color = category?.color ?? colorForCategoryName(name)
    const existing = totals.get(categoryId)
    if (existing === undefined) {
      totals.set(categoryId, { name, color, total: amount })
    } else {
      existing.total += amount
    }
  }

  for (const expense of input.expenses) {
    add(expense.categoryId, expense.price)
  }
  for (const pendiente of input.pendientes ?? []) {
    if (pendiente.expectedAmount !== null) {
      add(pendiente.categoryId, pendiente.expectedAmount)
    }
  }

  // Guard the divide: a period with no expenses (or, defensively, one whose
  // prices sum to 0) yields shares of 0 rather than NaN reaching the chart's
  // geometry, where it would silently render nothing.
  let grandTotal = 0
  for (const entry of totals.values()) {
    grandTotal += entry.total
  }

  return Array.from(totals.entries())
    .map(([categoryId, entry]) => ({
      categoryId,
      ...entry,
      share: grandTotal > 0 ? entry.total / grandTotal : 0,
    }))
    .sort((left, right) => right.total - left.total)
}

export type TarjetaLine = {
  readonly name: string
  readonly total: number
}

// The Tarjeta slice opened up: its paid cuotas by the purchase's category
// (Expense.subcategory), largest first, then the ajuste (subcategory null)
// and the month's still-unpaid Resúmenes, each on a line of its own. Lines
// add up to the slice's total in summarizeByCategory, given the same input.
export function summarizeTarjeta(input: {
  readonly categoryId: string
  readonly expenses: readonly Expense[]
  readonly pendientes: readonly {
    readonly categoryId: string
    readonly expectedAmount: number | null
  }[]
}): readonly TarjetaLine[] {
  const bySubcategory = new Map<string, number>()
  let ajuste: number | null = null
  for (const expense of input.expenses) {
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
  for (const pendiente of input.pendientes) {
    if (
      pendiente.categoryId === input.categoryId &&
      pendiente.expectedAmount !== null
    ) {
      unpaid = (unpaid ?? 0) + pendiente.expectedAmount
    }
  }
  return [
    ...Array.from(bySubcategory, ([name, total]) => ({ name, total })).sort(
      (left, right) => right.total - left.total,
    ),
    ...(ajuste === null ? [] : [{ name: 'Ajuste', total: ajuste }]),
    ...(unpaid === null ? [] : [{ name: 'Sin pagar', total: unpaid }]),
  ]
}
