# View full expense history, grouped by month

As a household member, I want to see every expense we've ever logged, not just this month's, so
that I can look back at what we spent in a previous month without it being lost once the month
ends.

## Context

Today expenses are only ever visible for the current calendar month (`ExpenseList`,
`listExpensesInMonth`) — viewing past months was explicitly out of scope in `add-expense.md`.
This story adds "Histórico", one of the four navigation destinations from `navigation-shell.md`:
a full, all-time expense feed. It reuses editing/deleting behavior from `edit-delete-expense.md`
where applicable, extended to work on expenses from any month, not just the current one.

## Acceptance criteria

- [ ] A member can view all of the household's expenses, most recent first, not limited to the
      current month.
- [ ] Expenses are grouped under month/year separators (e.g. "Agosto 2026"), not a single
      undifferentiated list — scrolling moves from the most recent month backward through older
      ones.
- [ ] Each expense row shows the same information as the restyled `ExpenseList` from
      `wallet-visual-system.md` (category color icon, name, price, category, date, author).
- [ ] A member can edit or delete an expense from any month, not only the current one — this
      lifts the restriction from `edit-delete-expense.md` that limited edit/delete to the current
      month's list, since that restriction existed only because past months weren't visible at
      all. The same validation rules apply (name non-empty, price positive, date not in the
      future); date is no longer restricted to staying within its original month, since crossing
      a month boundary is now a normal, visible edit rather than something that would move an
      expense out of view.
- [ ] If there are no expenses at all yet (brand new household), Histórico shows an empty-state
      message instead of an empty list.
- [ ] Loading is paginated one calendar month at a time (not a flat item-count cursor) rather
      than fetching the household's entire expense history in one request — a "load more" always
      completes the current month before starting the next, so a month's group never splits
      across two loads or renders a duplicated month header.
- [ ] Editing an expense's date from Histórico so it moves into or out of the current calendar
      month is allowed (per the general date-edit rule above) and is reflected on Home's
      remaining-budget figure the next time Home is viewed — see `home-dashboard.md`'s
      cross-screen refetch requirement, which this relies on rather than duplicating.
- [ ] `npm run typecheck`, `npm run lint`, and `npm test` pass; edit/delete tests are extended to
      cover a past-month expense, not just the current month.

## Out of scope

- Filtering by category or by member (the Categorías tab covers the by-category angle; a
  dedicated filter UI here is deferred until it's shown to be needed).
- Free-text search.
- Jumping directly to a specific month/year without scrolling (e.g. a month picker) — deferred;
  revisit if scrolling through grouped months proves slow in practice.

## Open questions

- None outstanding.
