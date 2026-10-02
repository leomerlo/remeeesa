import { MONTH_KEY_PATTERN } from '@/lib/households/monthlyBudget'
import type { CategorySummary } from './summaries'
import type { Category } from './types'

export type CategoryBudgetRow = {
  readonly categoryId: string
  readonly name: string
  readonly color: string
  // Everything the month has put in this category: expenses plus the bills
  // due in it, exactly what the breakdown counts, so the two agree.
  readonly spent: number
  readonly budget: number
  // Whole percent, clamped at 100 so a bar cannot overflow its track. The
  // figures beside it are not clamped -- going over is the thing worth
  // seeing.
  readonly percentUsed: number
  // Negative once the ceiling is passed.
  readonly remaining: number
  readonly overBudget: boolean
}

// A category with no ceiling is not shown a bar it has not asked for, so
// only the capped ones are rows here. A capped one with nothing spent yet
// still is: "$0 de $30.000" is the most useful moment of the month to see,
// and summarizeByCategory drops a category with no spending entirely.
export function categoryBudgetRows(input: {
  readonly categories: readonly Category[]
  readonly summaries: readonly CategorySummary[]
}): readonly CategoryBudgetRow[] {
  const spentById = new Map(
    input.summaries.map((summary) => [summary.categoryId, summary.total]),
  )
  return input.categories
    .filter((category) => category.monthlyBudget > 0)
    .map((category) => {
      const spent = spentById.get(category.id) ?? 0
      const budget = category.monthlyBudget
      return {
        categoryId: category.id,
        name: category.name,
        color: category.color,
        spent,
        budget,
        percentUsed: Math.min(100, Math.round((spent / budget) * 100)),
        remaining: budget - spent,
        overBudget: spent > budget,
      }
    })
    .sort((left, right) => right.percentUsed - left.percentUsed)
}

export function totalCategoryBudgets(categories: readonly Category[]): number {
  let total = 0
  for (const category of categories) {
    total += category.monthlyBudget
  }
  return total
}

// Ceilings are deliberately allowed not to add up: per direct feedback you
// cap the few categories that matter and leave the rest alone, so their sum
// is normally well under the monthly budget. Going *over* it is the case
// worth saying out loud -- the household has promised itself more than it
// has -- but it is a warning, not a refusal. Silent with no monthly budget
// set, since there is nothing to be over.
export function categoryBudgetsOverspill(input: {
  readonly categories: readonly Category[]
  readonly monthlyBudget: number
}): number {
  if (input.monthlyBudget <= 0) {
    return 0
  }
  const assigned = totalCategoryBudgets(input.categories)
  return assigned > input.monthlyBudget ? assigned - input.monthlyBudget : 0
}

// Per-month category budgets, keyed "2026-04" like the household's own
// monthly_budgets. A month with no key inherits the latest key before it; a
// key holding null means "no budget from this month on", which is why
// clearing is a value of its own and not zero. A month before every key has
// no budget: unlike the household's, a category's budget is optional, so
// there is nothing earlier to fall back on.
export type CategoryMonthBudgets = Readonly<Record<string, number | null>>

export function resolveCategoryBudget(
  budgets: CategoryMonthBudgets,
  month: string,
): number | null {
  let inForce: string | undefined
  for (const key of Object.keys(budgets)) {
    if (key <= month && (inForce === undefined || key > inForce)) {
      inForce = key
    }
  }
  return inForce === undefined ? null : (budgets[inForce] ?? null)
}

export function parseBudgetMonth(month: string): string {
  if (!MONTH_KEY_PATTERN.test(month)) {
    throw new Error('El mes del presupuesto no es válido')
  }
  return month
}

// Null clears; an amount has to be a real budget. The household budget's
// rule (a finite, non-negative number) plus one more: zero is refused rather
// than read as "clear", so the two can never be confused in storage. Its own
// message, since the household's talks about the monthly budget.
export function parseCategoryMonthBudget(amount: number | null): number | null {
  if (amount === null) {
    return null
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('El presupuesto de la categoría tiene que ser mayor a 0')
  }
  return amount
}

// A new map with only `month` changed: earlier months keep the figure they
// were run on, and later months keep any figure set for them explicitly.
export function setBudget(
  budgets: CategoryMonthBudgets,
  month: string,
  amount: number | null,
): CategoryMonthBudgets {
  return {
    ...budgets,
    [parseBudgetMonth(month)]: parseCategoryMonthBudget(amount),
  }
}
