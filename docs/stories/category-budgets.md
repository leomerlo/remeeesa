# Split the budget by category

As a household member, I want to assign an amount to each category and see how much has been spent and how much is left in each one, so that I know where the month's money is going before it runs out.

## Context

The household has a single monthly budget (`monthlyBudget`; `0` means no budget set), and the Categories screen already shows spend per category, but there is no way to say "Food gets $300". Without a per-category amount there is no "remaining" per category. This story adds a per-category amount, edited per month, and shows spent and remaining next to it. It reverses the "per-category budgets" exclusion in `categorias-desglose-y-gestion.md`; the total household budget stays as is.

## Acceptance criteria

- [ ] On the Categories screen, any household member can set, change, or clear the amount of a category for the current month. "Clear" is a separate action from entering 0.
- [ ] Amounts are validated like the monthly budget (reusing its parsing/validation): finite, greater than 0, same decimal rules. Invalid input is rejected with a message.
- [ ] Each category with an amount shows the amount, spent, and remaining = amount − spent.
- [ ] "Spent" counts paid expenses only. Pending bills with an expected amount are not counted until paid; once paid they count. The existing category breakdown is unchanged, so the screen may show two numbers for a category (breakdown total incl. pending vs. budget spent); the budget rows are labelled so the difference is clear.
- [ ] When spent exceeds the amount, remaining is shown as a negative number using the app's existing over-budget/alert colour token. Nothing is blocked.
- [ ] A category without an amount shows spent only, with no remaining.
- [ ] Months are calendar months in the household's existing month convention. A month with no edits uses the amounts of the most recent earlier month that has any; editing or clearing a category in month M applies to M and every later month with no edit of its own for that category. Earlier months are never altered.
  - Given March has Food $300 and no April edits, when April is viewed, then Food shows $300.
  - Given March has Food $300, when Food is changed to $400 in April, then April and later months show $400 and March still shows $300.
  - Given April has Food cleared, when May is viewed, then Food has no amount.
- [ ] When the household has a total budget (`monthlyBudget` > 0), the screen shows the sum of category amounts, the unassigned part (total − sum) when positive, and an over-allocation warning when the sum exceeds the total. Saving is never blocked. At exactly zero unassigned, neither indicator is shown.
- [ ] When `monthlyBudget` is 0, category amounts still work; the unassigned and over-allocation indicators are not shown.
- [ ] Merging category A into B: B's amount becomes the sum of both (or whichever side has one); A's amount is removed, in every stored month. Renaming keeps the amount. Deleting (only possible for a category with no expenses or pending bills) removes its amounts in every stored month.
- [ ] Spend on an orphaned/unknown category shows spent only, with no amount.
- [ ] Firestore security rules allow any household member to read and write the category amounts and no one else.
- [ ] Home is unchanged.
- [ ] Unit tests cover remaining and overspend, paid-only spent, month inheritance (including clear), no-total behavior, over-allocation, validation, and merge/delete/rename. `npm test`, `npm run typecheck` and `npm run lint` pass.

## Out of scope

- Percentage-based allocations.
- Showing per-category budgets on Home.
- Viewing or editing allocations for past months.
- Alerts or notifications when a category nears or exceeds its amount.
- Blocking over-allocation or overspend.
- Per-member allocations.
- Reconciling the breakdown total (incl. pending) with budget spent (paid only).

## Open questions

- Where the amounts are stored (per-category field keyed by month vs. a per-month document) is left to the design doc in `story-to-tickets`.
