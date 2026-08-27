# Edit and delete an expense — design note

Story: [docs/stories/edit-delete-expense.md](stories/edit-delete-expense.md)

Assumes [add-expense](add-expense-design.md) (expenses table, categories, current-month list/query, budget calc) already exists.

## Order of work

1. **Edit mutation** — add an `updateExpense` mutation reusing the existing create-expense validation (name, price, category resolve/normalize, date not-future) plus a new check: the resolved date must fall within the current calendar month, else reject with a validation error. A plain update-by-id naturally gives last-write-wins with no version/lock field needed.
2. **Delete mutation** — add `deleteExpense` (hard delete by id). Both mutations must first check the row still exists; if not, return a typed "not found" error (e.g. `EXPENSE_NOT_FOUND`) instead of throwing/crashing.
3. **UI: edit** — reuse the add-expense form component in an "edit mode" (pre-filled), triggered from the list. On submit success, refetch budget + list; on `EXPENSE_NOT_FOUND`, show the "this expense no longer exists" message and refetch the list.
4. **UI: delete** — confirmation dialog on the list row, calls the delete mutation; same not-found handling and refetch on success.
5. **Author display** — ensure the expense list query stores/joins a display-name snapshot (not a live user-membership join) so it survives the author leaving the household.

## Tickets

1. Edit-expense mutation with validation and month-boundary rejection
2. Delete-expense mutation with not-found handling
3. Edit-expense not-found handling on concurrent edit
4. Edit-expense UI: form, refetch, and stale-error message
5. Delete-expense UI: confirmation dialog, refetch, and stale-error message
6. Persist author display name independent of membership status

See the GitHub issues for full acceptance criteria and dependencies.
