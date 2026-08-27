# Add an expense to the household

As a household member, I want to log an expense with a name, price, category, and optional comments, so that it counts against my household's monthly budget and I can see how much is left.

## Context

Households already exist with a single monthly budget (see [create-household-and-invite](create-household-and-invite.md)). This story adds the ability for a member to record an expense against that budget, choose or create a category, and see the household's remaining budget for the current month reflected afterward.

## Acceptance criteria

- [ ] A member can add an expense with: name (required, non-empty text), price (required, positive number, stored with 2 decimal places, no maximum), category (required — pick from the household's existing categories, or type free text to create a new one), and comments (optional free text).
- [ ] The expense is always attributed to the currently logged-in member — there is no way to select a different member as the author.
- [ ] The expense has a date, defaulting to today, which the member can change to any date up to and including today (no future dates).
- [ ] The expense counts toward the household's budget for the calendar month of its date (not necessarily the month it was entered).
- [ ] A new household starts with these default categories: Comida, Transporte, Servicios, Entretenimiento, Salud, Otros.
- [ ] When a member types a category not already in the household's list, it is trimmed and compared case-insensitively against existing categories; if it matches an existing one, that existing category is used, otherwise it is saved as a new category and becomes available for all members to pick from afterward.
- [ ] After adding an expense, the member can see the household's remaining budget for the current month (monthly budget minus the sum of all expenses dated in the current month), with no breakdown by category.
- [ ] If total expenses for the month exceed the budget, the remaining amount is shown as negative — adding the expense is never blocked for this reason.
- [ ] A member can view a list of the household's expenses for the current month, sorted newest first, showing name, price, category, date, and the display name of the member who logged it. If there are no expenses for the current month, the list shows an empty-state message instead.

## Out of scope

- Editing or deleting an existing expense (separate story).
- Reassigning an expense's author after creation.
- Per-category budgets or per-category remaining amounts.
- Viewing expenses from months other than the current one.
- Renaming, merging, or deleting categories.
- Any restriction or approval workflow when a household exceeds its budget.

## Open questions

- None outstanding.
