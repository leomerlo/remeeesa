# Add an expense to the household — design note

Story: [docs/stories/add-expense.md](stories/add-expense.md)

Builds on the households/members/budget schema from [create-household-and-invite](create-household-and-invite-design.md).

## Order of work

1. **Schema: `categories` + `expenses` collections, security rules.** `categories(id, household_id, name, created_at)` with uniqueness on `(household_id, lower(name))` for case-insensitive dedup. `expenses(id, household_id, category_id, member_id, name, price number with 2 decimals, comments, expense_date, created_at)`. Security rules: household members can read/create on both collections scoped to their `household_id`. Validation: `price > 0`, `expense_date <= today` (rules plus Cloud Functions; Firestore has no CHECK constraints).
2. **Default category seeding.** A Cloud Function on household creation that inserts the six default categories.
3. **Category fetch + create-or-reuse logic.** A find-or-create Cloud Function (trim + case-insensitive match, insert if not found), preferred server-side to avoid race/duplicate inserts.
4. **Add-expense form + mutation.** React Query mutation calling category resolution then expense insert; author is always the logged-in member's row; date picker defaulting to today, max = today.
5. **Remaining-budget calculation & display.** Sum expenses where `expense_date` is in the current calendar month for the household; `remaining = budget - sum`.
6. **Current-month expense list.** Query joined with categories + member display name, ordered by `expense_date desc, created_at desc`, current month only; empty state when zero rows.

## Tickets

1. Categories & expenses schema, security rules, default seeding
2. Category resolution (find-or-create) Cloud Function
3. Add-expense form and submission
4. Remaining monthly budget display
5. Current-month expense list view

See the GitHub issues for full acceptance criteria and dependencies.
