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
