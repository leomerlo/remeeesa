# Remeeesa

Household budgeting app: a Household tracks shared Expenses against one shared monthly budget,
with every Member holding equal permissions over both.

## Language

**Household**:
A group of people sharing one monthly budget and one pool of Expenses. Has a name and a single
`monthlyBudget` amount (recurring, not per-period).
_Avoid_: Group, family, account

**Member** (code: `HouseholdMember`):
A person belonging to exactly one Household at a time, with the same permissions as every other
Member — there is no owner/admin role. Identified by `userId`.
_Avoid_: User (User is the auth identity; Member is that identity's membership in a Household)

**Category**:
A named grouping for Expenses, scoped to one Household (not shared across households). Carries a
color, auto-assigned deterministically from its name (same name -> same color, no manual picker
yet) for at-a-glance recognition in the wallet-style UI. Created implicitly the first time a
Member types a new category name on an Expense — there is no dedicated category-management
screen yet.
_Avoid_: Tag, label

**Expense**:
A single logged cost: name, price, one Category, the Member who authored it, an optional
comment, and a date. Counts against its Household's budget for the calendar month of its
`expenseDate`, regardless of when it was entered.
_Avoid_: Transaction, purchase

**Remaining budget**:
A Household's `monthlyBudget` minus the sum of all Expenses dated in the current calendar month.
Can go negative (over budget) — this never blocks adding more Expenses.
_Avoid_: Balance (reserved for a future income-tracking concept, not yet in scope)

**Pendiente** (Bill):
A payment obligation, tracked *before* it's paid — the accounts-payable side of the household,
distinct from Expense (the accounts-paid side). Has a category, an optional expected amount
(often unknown ahead of time — recurring amounts change month to month), a due date, and a
pending/paid status. Marking a Pendiente paid records the real amount and generates the matching
Expense; that's the moment it starts counting against the budget.
_Avoid_: Bill (English works too, but "Pendiente" is the term the household actually uses),
recurring expense (a Pendiente may or may not repeat monthly)

**Recurring** (as applied to a Pendiente):
A Pendiente that comes back every month under the same name/category (e.g. "Internet", "Seguro del
auto") — but the *amount* is expected to vary each cycle (inflation), so recurring never means
"auto-charge the same amount." A household member marks a Pendiente recurring manually; the
household is expected to recognize what's recurring through use, not declare it all up front.

## Relationships

- A **Household** has one `monthlyBudget` and many **Members**.
- A **Member** belongs to at most one **Household** at a time.
- An **Expense** belongs to exactly one **Household**, is authored by one **Member**, and is
  assigned exactly one **Category**.
- A **Category** belongs to exactly one **Household** (categories are not shared across
  Households); a new Household is seeded with 6 defaults (Comida, Transporte, Servicios,
  Entretenimiento, Salud, Otros).
- **Remaining budget** is derived, not stored: `Household.monthlyBudget` minus the sum of the
  current month's **Expenses**.
- A **Pendiente** belongs to exactly one **Household** and one **Category**. Paying a Pendiente
  generates exactly one **Expense**; an **Expense** may or may not have originated from a Pendiente
  (a coffee bought on the spot is an Expense with no Pendiente behind it).

## Example dialogue

> **Dev:** "When a Member deletes their account, what happens to the Category color and their
> logged Expenses?"
> **Domain expert:** "The Expense keeps showing `authorDisplayName` as it was at the time —
> that's a snapshot, not a live reference to the Member. Category color is unaffected either way,
> since it's derived from the Category's name, not tied to any Member."

## Flagged ambiguities

- None yet.
