# Compras con tarjeta — design note

Story: [docs/stories/compras-con-tarjeta.md](stories/compras-con-tarjeta.md)

## Data model

- **`cards/{autoId}`** — `household_id`, `name`, `created_at`. Name rules (trimmed, non-empty, case-insensitive unique) checked client-side against `listCards` (`ponytail:` two members adding the same name concurrently can race; move to name-keyed ids if it ever matters).
- **`card_purchases/{autoId}`** — `household_id`, `card_id`, `category_id`, `member_id`, `author_display_name`, `name`, `total`, `cuotas` (1–24), `purchase_date`, `comments`, `created_at`. Cuotas are **not stored**: pure `cuotasOf(purchase)` works in cents (`base = floor(cents / N)`, last = `cents − base·(N−1)`); cuota *k* lands in month `M + k`.
- **Resumen = a Pendiente doc** with deterministic id `pendientes/{cardId}_{YYYY-MM}`: `name` = card name, `category_id` = "Tarjeta" (find-or-created on purchase log), `due_date` = day 10, `expected_amount` = sum of its cuotas, plus new `card_id`, `purchase_ids: string[]`, `paid_expense_ids: string[]`. Stored (not derived) because every budget consumer already goes through `listPendientes` + `pendientesDueInMonth` (`RemainingBudgetDisplay`, `SpentThisMonthDisplay`, `CategoryMiniSummary`, `CategoryBreakdown`, `MonthlyTotalsChart`, `PorPagarSection`, `PendientesList`, due-soon banner) — no budget-math changes. The deterministic id lets transactions `tx.get` it (client transactions can't query).
- **Paid state / undo**: reuses `status`, `paid_at`, `paid_expense_id` (first cuota expense); `paid_expense_ids` lists all generated expenses.
- **Lock**: paying a Resumen adds its id to `card_purchases.paid_resumen_ids` on each of its purchases (undo removes it). A purchase with a non-empty list is read-only (`CardPurchaseLockedError`), checked by the client transaction and the rules alike — the rules can read it off the purchase itself instead of `get()`-ing up to 24 Resúmenes.
- **Expense** gains `subcategory: string | null` — a snapshot of the purchase's category *name*, set only on card cuota expenses; old docs parse as null. Renaming a category later doesn't change old card expenses.

## Writes (all atomic, `runTransaction`)

- **Create / edit / delete purchase**: `tx.get` every affected Resumen (old + new months). If any is paid → reject (new months: `ResumenAlreadyPaidError` "El resumen de <card> de <mes> ya está pagado."; old months: `CardPurchaseLockedError`). Otherwise upsert each Resumen (recompute `expected_amount`, `purchase_ids`); delete a Resumen whose `purchase_ids` becomes empty.
- **`markResumenPaid`**: reject if already paid or before the Resumen's month starts. `tx.get` Resumen + purchases; write one Expense per cuota (purchase name, cuota amount, Tarjeta category, `subcategory`, `pendiente_id` = Resumen, `is_service: false`), plus `"<card> — ajuste"` (difference, may be negative) if the amount paid differs; mark paid. Expense date = payment date if within the Resumen's month, else that month's last day.
- **Undo**: generalise `unmarkPendientePaid` (Firestore + memory) to also delete `paid_expense_ids`. The existing "delete a Pendiente-generated expense = undo payment" path in `AddExpenseForm` keeps working.
- **Rename card**: one batch updates the card and `name` on every Pendiente with that `card_id` (any status).

## Firestore rules

- `cards`, `card_purchases`: members only; shape checks; `card_id`/`category_id` in the same household; `cuotas` int 1–24; `total >= cuotas * 0.01`; `purchase_date` not in the future.
- Pendientes: create may include `card_id`, `purchase_ids`; `paid_expense_ids` is only written by paying (`isValidResumenMarkPaid`) and undoing. `isValidPendienteUpdate` excludes `card_id` docs; new `isValidResumenUpdate` allows only `expected_amount` + `purchase_ids` while pending; mark-paid / unmark may also touch `paid_expense_ids`; `isResumenRename` allows a name-only change in any status. Paid Resúmenes are frozen, so rules reject purchase edits that try to touch them, and a purchase whose `paid_resumen_ids` is non-empty can't be edited or deleted at all. `paid_resumen_ids` only changes one id at a time, and only when that Resumen is paid (or pending again) by the end of the same commit. Paying touches a handful of distinct docs in rules lookups (membership, the Resumen, "Tarjeta", the first expense) however many cuotas it has, since repeated lookups of one doc are cached.
- Expenses: add `subcategory` (string or null); `price < 0` (and a non-null `subcategory`) allowed only when `pendiente_id` points to a doc with `card_id`, in the commit that pays it (the ajuste). A category-only repoint is allowed whatever the price.

## UI decisions

- The purchase shows, marked and not summed, in its purchase month in both Home's "Últimos gastos del mes" and Histórico.
- Categorías: "Tarjeta" is its own slice; opening it groups by `subcategory` (null → "Ajuste"), plus one "Sin pagar" line for unpaid Resúmenes.
- A 1-cuota purchase reads "Visa · 1 cuota · no suma este mes".

## Touched files

`src/lib/cards/` (new: types, validate, `cuotas.ts`, cards/purchases/resumen functions + tests); `src/lib/expenses/{types,converters,summaries}.ts`; `src/lib/pendientes/{types,converters}.ts`; `src/lib/households/types.ts`, `firestoreHouseholdsDb.ts`, `src/test/memoryHouseholdsDb.ts`; `features/household/EditHouseholdPage.tsx` (+ `CardsSection`); `features/expenses/AddGastoForm.tsx`, `RecentExpensesList.tsx`; Histórico list; `features/pendientes/PorPagarSection.tsx`, `PendientesList.tsx`, new `ResumenSheet.tsx`; `features/home/HomePage.tsx`; `features/categorias/CategoryBreakdown.tsx`; `firestore.rules`; `CONTEXT.md`; `docs/adr/0006-resumen-payment-creates-expense-per-cuota.md`; `src/demo/seed.ts`.

## New ADR

**0006** — paying a Resumen creates one Expense per cuota plus an optional ajuste (vs ADR 0004's one Expense per Pendiente), so each purchase's category survives payment as a subcategory.

## Order

T1 cards → T2 log purchase + Resúmenes in budget → T3 read-only views → T4 edit/delete → T5 pay/undo/lock → T6 Categorías slice + demo seed, T7 rename (both after T5).
