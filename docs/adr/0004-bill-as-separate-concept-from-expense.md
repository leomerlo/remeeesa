---
status: accepted
---

# Pendiente (Bill) is a separate concept from Expense, not a status on Expense

Remeeesa's actual use (a household run by two people tracking real bills — servicios, auto,
salud, gimnasio, personal spending — where recurring amounts change month to month because of
inflation) needs more than a log of money already spent: it needs to track payment obligations
before they're paid — a due date, an expected/unknown amount, and a pending/paid status — the way
a household accountant would.

We considered adding `status` (`pending`/`paid`) and an optional `dueDate` directly onto
`Expense`. Rejected: `Expense` is defined (see `CONTEXT.md`) as money that has already left the
household and counts against the current month's budget the moment it's logged. A pending
`Expense` with no amount yet would break that definition — would it count against the budget at
$0? At its (unknown) eventual amount? Neither answer is clean.

Decision: **Pendiente** (Bill) is a distinct entity — an obligation to pay, with a category, an
optional expected amount, a due date, and a pending/paid status. Marking a Pendiente paid records
the real amount and *generates* the corresponding `Expense` (which is when it starts counting
against the budget) — mirroring how a real accounts-payable ledger works: a bill exists before
it's paid; an expense is the record that it was.

This is a real trade-off (a second entity plus a paid-transition to design and build, vs. one
flag) chosen deliberately for correctness of the budget-vs-obligations boundary, and it's not
obvious from `Expense`'s current shape that this split was intentional rather than a missing
feature — worth recording so nobody "simplifies" it back into a status flag on `Expense` later.

Recurrence (a Pendiente repeating monthly, e.g. "Internet") stays a property of Pendiente, resolved at
implementation time — not a CONTEXT.md-level domain distinction yet.
