# Design note: historico-de-movimientos

Story: [historico-de-movimientos.md](stories/historico-de-movimientos.md). Depends on
`navigation-shell.md` (route/shared sheet) and `wallet-visual-system.md` (row visuals).

## Layering

1. `HouseholdsDb` gains a paginated, **month-aligned** history read (not a row-count cursor) —
   both the Firestore implementation and the in-memory test double.
2. `src/lib/expenses/expenses.ts` — thin wrapper mirroring `listExpensesInMonth`'s pattern. Also
   modify `updateExpense`: drop `assertExpenseInCurrentMonth`, swap
   `parseExpenseDateInCurrentMonth` for plain `parseExpenseDate`.
3. `src/lib/expenses/validate.ts` — `assertExpenseInCurrentMonth` /
   `parseExpenseDateInCurrentMonth` become dead code once step 2 lands; remove them.
4. `src/features/expenses/queryKeys.ts` — a query key for the paginated all-time feed. This (plus
   the existing `expensesInMonthQueryKey`) is what needs to participate in `home-dashboard.md`'s
   shared cross-screen invalidation — this story participates in that mechanism, doesn't build it.
5. New `src/features/expenses/ExpenseHistory.tsx` — month-grouped, paginated UI reusing the
   restyled row markup and `DeleteExpenseDialog`/edit-trigger pattern from `ExpenseList.tsx`.
6. Wire into the Histórico nav destination; edit taps open the shared bottom sheet.

## Slices (order: 1 and 2 in parallel → 3 (needs 1) → 4 (needs 2 and 3) → 5 (needs 4 + home-dashboard's invalidation))

1. Paginated, month-aligned expense history query (data layer)
2. Lift the current-month restriction on edit/delete
3. Histórico screen: month-grouped, paginated feed with empty state
4. Edit/delete wired into Histórico for any month
5. Cross-screen refetch when a date edit crosses the current-month boundary — **relies on**
   `home-dashboard.md`'s shared query-key/invalidation mechanism rather than building a separate
   one; sequence this slice after (or in lockstep with) that story's Slice 1.
