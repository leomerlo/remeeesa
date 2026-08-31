# Track Cuentas (bills) pending payment

As a household member, I want to track what we still have to pay — with a due date and an
expected amount that isn't locked in until we actually pay it — so that we don't miss a payment,
the way a household accountant keeps a bills-to-pay list separate from the record of money
already spent.

## Context

See [CONTEXT.md](../../CONTEXT.md) for the **Cuenta** term and
[ADR-0004](../adr/0004-bill-as-separate-concept-from-expense.md) for why it's a separate entity
from `Expense` rather than a status flag on it. A Cuenta represents an obligation to pay —
recurring (e.g. "Internet", paid every month, amount varies with inflation) or one-off — tracked
from the moment it's known about until it's paid, at which point it generates the real `Expense`.
This story adds the Cuenta entity and its full lifecycle; surfacing it on Home ("Por pagar") is
`home-dashboard.md`.

## Acceptance criteria

- [ ] A member can create a Cuenta with: name (required), category (required — same
      pick-or-create-by-typing behavior as an Expense's category), due date (required), and
      expected amount (optional — may be left blank when the amount isn't known yet, e.g. a bill
      that hasn't arrived).
- [ ] A member can mark a Cuenta recurring (a simple flag/toggle at creation, or afterward as one
      of the editable fields on a pending Cuenta) — this only affects the auto-creation behavior
      below; it never auto-fills or auto-repeats an amount, since recurring amounts are expected
      to change every cycle.
- [ ] A Cuenta's due date may be in the past at creation (a household entering a bill that's
      already overdue is a normal, expected case, not an error).
- [ ] When a recurring Cuenta is marked paid, the next cycle's Cuenta is created automatically
      (same name, category, and recurring flag; due date advanced by one month; amount blank),
      so the household doesn't have to re-enter it from scratch every month.
- [ ] A Cuenta has a status: pending or paid. New Cuentas start pending.
- [ ] Marking a Cuenta paid requires entering the final amount (pre-filled from the expected
      amount if one was set, editable) and a payment date (defaulting to today, changeable to any
      date up to and including today — same rule as logging an expense directly, per
      `add-expense.md`). This generates an `Expense` with that amount, date, the Cuenta's
      category, and the paying member as author. The Cuenta then becomes paid and is no longer
      pending.
- [ ] Marking paid is idempotent, not last-write-wins: once a Cuenta's status is paid, a second
      mark-paid attempt (e.g. two members tapping it within moments of each other) is rejected
      with a clear "this Cuenta was already paid" message and does **not** generate a second
      `Expense`. This is a deliberate exception to this app's usual last-write-wins rule, because
      here a race would double-count real money, not just overwrite a field — see
      [ADR-0004](../adr/0004-bill-as-separate-concept-from-expense.md).
- [ ] The mark-paid transition (Cuenta -> paid, create its Expense, and — if recurring — create
      the next cycle's Cuenta) happens as a single atomic write (e.g. a Firestore transaction). A
      failure partway through must not leave a paid Cuenta with no Expense, or an Expense with no
      corresponding paid Cuenta.
- [ ] A member can view all pending Cuentas for the household, ordered by soonest due date first.
- [ ] A member can edit a pending Cuenta's name, category, due date, or expected amount. A paid
      Cuenta cannot be edited (its Expense already exists and is the record of what happened —
      edit the Expense instead, same as any other expense).
- [ ] A member can delete a pending Cuenta (e.g. it turned out not to apply this cycle). Deleting
      a pending Cuenta never deletes or affects any Expense — none exists yet.
- [ ] If two members concurrently edit a still-pending Cuenta's name, category, due date, or
      expected amount, the last write wins — same rule as budget and expense edits elsewhere in
      the app. (Concurrent mark-paid attempts are the idempotency rule above, not this one.)
- [ ] Firestore security rules and schema for the `cuentas` collection are added, scoped to
      household members only, consistent with the existing `expenses`/`categories` rules.

## Out of scope

- Automatic detection of recurring patterns from Expense history (recurring is only ever set
  manually, per the resolved discussion — see CONTEXT.md).
- Splitting a single Cuenta across multiple categories or members (e.g. one bill covering two
  different expense types) — explicitly deferred; charge it to a single category for now.
- Due-date reminders/notifications (push, email, etc.) — this story only covers the pending-list
  view; alerting is a future story if wanted.
- Recurring amount suggestions/pre-fill based on past cycles.
- Viewing paid Cuentas as their own list (once paid, they're an Expense — visible in Histórico
  like any other).

## Open questions

- None outstanding.
