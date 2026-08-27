# Edit and delete an expense

As a household member, I want to edit or delete any expense in my household, so that I can correct mistakes or remove expenses that shouldn't count against our budget.

## Context

Expenses can currently only be created (see [add-expense](add-expense.md)); this story adds editing and deleting. Consistent with the household's equal-permissions model (see [create-household-and-invite](create-household-and-invite.md)), any member can edit or delete any expense in the household, not just the one they logged.

## Acceptance criteria

- [ ] Any member of the household can edit or delete any expense belonging to the current month's list (not just expenses they personally logged).
- [ ] Editing an expense allows changing any of its fields: name, price, category, comments, and date — with the same validation rules as creating an expense (name non-empty, price positive with 2 decimals, category picked or free-text created with the same normalization rules, date not in the future).
- [ ] The date can only be changed to another date within the current calendar month; a date change that would move the expense out of the current month is rejected with a clear validation message.
- [ ] Deleting an expense requires the member to confirm via a dialog before it is permanently removed.
- [ ] Deletion is permanent (hard delete) — no history or undo is kept.
- [ ] After an edit or delete, the household's remaining monthly budget and the expense list are refetched and reflect the change without requiring a manual page reload.
- [ ] Editing or deleting an expense from a past month is not supported, since only the current month's expenses are visible or actionable.
- [ ] If two members edit the same expense concurrently, the last write wins (same rule as budget edits) — no locking or merge.
- [ ] Attempting to edit or delete an expense that another member has already deleted shows a clear error (e.g. "this expense no longer exists") instead of failing silently or crashing.
- [ ] The expense continues to display the display name of the member who logged it even if that member has since left the household.

## Out of scope

- Editing or deleting expenses from months other than the current one.
- Moving an expense's date to a different month via edit.
- Edit history, audit trail, or soft delete / undo.
- Restricting edit/delete to the original author (all members have equal permissions on all expenses).

## Open questions

- None outstanding.
