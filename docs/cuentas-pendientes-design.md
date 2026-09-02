# Design note: pendientes-pendientes

Story: [cuentas-pendientes.md](stories/cuentas-pendientes.md). ADR:
[0004](adr/0004-bill-as-separate-concept-from-expense.md). Depends on `navigation-shell.md`'s
bottom-sheet primitive.

## Scope note: no nav destination of its own

`navigation-shell.md` keeps "Nuevo pendiente" and the "Por pagar" entry point out of scope
(deferred to `home-dashboard.md`), and there's no 5th bottom-nav destination for Pendientes. This
story adds an unlinked `/pendientes` route (not in the nav bar yet) so the list/create/edit/mark-paid
UI is reachable and testable on its own; `home-dashboard.md` wires it into the nav flow later.

## Layering (mirrors the existing Expense stack)

1. `src/lib/pendientes/types.ts` — `Pendiente`: id, householdId, categoryId, name, dueDate,
   expectedAmount (nullable), recurring, status (`pending`/`paid`), paidExpenseId (nullable),
   createdAt.
2. `src/lib/pendientes/validate.ts` — mirrors `expenses/validate.ts`; due date has **no**
   past/future bound (past is explicitly allowed). Payment-date/amount on mark-paid reuse
   `parseExpenseDate`/`parseExpensePrice` verbatim, not a fork.
3. `src/lib/pendientes/pendientes.ts` — `createPendiente`, `listPendientes`, `updatePendiente` (blocks
   edits when not pending), `deletePendiente`, `markPendientePaid`. New `PendienteAlreadyPaidError`.
4. `HouseholdsDb` gains the above plus `getPendiente`; `markPendientePaid` returns
   `{ pendiente, expense, nextPendiente }`.

## The mark-paid transaction (the load-bearing piece)

Single `runTransaction` (same pattern as `createHouseholdAndMembership`/`joinHousehold`):
`tx.get(pendienteRef)` first — if missing or `status !== 'pending'`, throw
`PendienteAlreadyPaidError` **before any writes**. This is what makes it idempotent under a race:
Firestore's snapshot isolation means a second concurrent call either sees the already-`paid`
status on its own `tx.get`, or gets aborted/retried and re-reads post-commit — either way exactly
one `Expense` is ever created. Inside the same transaction: update Pendiente → paid + `paidExpenseId`,
create the Expense doc, and — if recurring — create the next cycle's Pendiente (due date +1 month,
amount blank). All three writes, one transaction: a partial failure rolls back everything.

**Short months:** "+1 month" clamps to the last day of the target month (Jan 31 → Feb 28, or Feb 29
in a leap year). The clamp is permanent by design — each cycle is computed from the previous
cycle's stored day, so a Jan 31 pendiente becomes Feb 28 and then stays on the 28th rather than
snapping back to 31; snapping back would require storing an extra anchor-day field on the Pendiente,
which we deliberately do not.

## Firestore rules

New `/pendientes/{pendienteId}` block, `isMemberOf`-gated like `expenses`/`categories`: edits to
name/category/dueDate/expectedAmount/recurring only while `status == 'pending'`; a **separate**
narrow allowance for the paid transition (diff limited to `status`+`paidExpenseId`,
`resource.data.status == 'pending'` required) as a rules-level idempotency backstop independent
of application logic; delete only while pending. Composite index:
`household_id ASC, status ASC, due_date ASC`.

**Flag for `categorias-desglose-y-gestion.md`:** its category-merge slice needs a narrow
additional rule allowance — a `category_id`-only update permitted on a Pendiente **regardless of
status** (so merging a category can repoint paid Pendientes too, without reopening them for edits
otherwise). This is an intentional, narrow exception to "a paid Pendiente can't be edited" — see
that story's design doc.

## Slices (order: 1 → 2 → (3, 4 parallel) → 5 → 6 → 7)

1. Pendiente schema, validation, and Firestore rules foundation
2. Create Pendiente (form + bottom sheet)
3. View pending Pendientes list
4. Edit and delete a pending Pendiente
5. Mark-paid transaction (atomic + idempotent) — domain/Firestore layer
6. Mark-paid UI (bottom sheet)
7. Recurring: auto-create next cycle on mark-paid
