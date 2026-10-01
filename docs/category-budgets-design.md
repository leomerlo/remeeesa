# Category budgets — design

Story: [category-budgets.md](stories/category-budgets.md)

## Approach

Store amounts on the existing Category document as a map `budgets: { "YYYY-MM": number | null }`
(`null` = cleared from that month on). No new collection, so household-member access reuses the
existing category rules. A month's amount is the value at the latest key `<=` that month
(`null` or no key => no amount). Editing month M writes only key M; later explicit keys keep
winning, earlier months are untouched.

## Touched code

- `src/lib/expenses/types.ts` — `Category.budgets` (optional map).
- `src/lib/expenses/` — new pure module `categoryBudgets.ts`: `resolveCategoryBudget(budgets, month)`,
  `setBudget(budgets, month, amount | null)`, `mergeBudgets(a, b)`; amount validation reuses the
  monthly-budget parsing in `src/lib/households/validate.ts`. Paid-only spent via a `paidOnly`
  option on `summarizeByCategory` (`summaries.ts`) rather than a second summarizer.
- `src/lib/households/` — `HouseholdsDb.setCategoryBudget`, Firestore + in-memory implementations,
  converters; merge/rename (`categoryManagement.ts`) carry `budgets`.
- `firestore.rules` — add `budgets` to `isValidCategory` (map of `YYYY-MM` -> number > 0 or null) and
  to the allowed update keys in `isValidCategoryUpdate`.
- Categories screen — per-category amount/spent/remaining, edit control, total-budget summary.

## Order

1 (domain + storage) -> 2, 3, 4 in parallel.
