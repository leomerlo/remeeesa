# Design note: next-month-view

User need: "como usuario me gustaria poder ver el mes que viene para
organizarlo antes de que comience". Settled in a grilling session, no separate
story file.

## Scope

- **See** next month on Home: what is already committed (services due) against
  the budget.
- **Plan** next month: log things that are coming (as not-yet-paid
  Pendientes with a future due date -- already supported by AddGastoForm).
- Out of scope: a per-month budget (`monthlyBudget` stays one household-wide
  figure) and per-category budgets.

## Decisions

1. **Recurring services are unchanged.** A recurring Pendiente's next cycle is
   still created when the current one is paid (`markPendientePaid`). The
   feature is used at the end of the month, when most of this month's bills
   are paid and next month's already exist.
   *This limit is now closed* (see `src/lib/pendientes/projectedCycles.ts`).
   An unpaid recurring bill's next cycles are projected in memory for the
   month being viewed, so it appears in every month it is due for and
   "Presupuesto restante" is no longer optimistic. The duplicate this note
   worried about cannot happen: a projection is only ever made from a bill
   that is still *pending*, and paying one is exactly what turns it into a
   record, so the source of the projection stops being a source at the same
   moment the real cycle appears. Projections carry no record, so they
   cannot be paid or edited -- they are marked "Previsto" and are inert.
2. **Home pages forward one month only.** `MonthPager`'s `allowFuture`
   boolean becomes `maxMonthsAhead` (0 by default, 1 on Home, unbounded on
   Servicios). Two months ahead would be empty, since services are only
   generated one cycle at a time. Categorías keeps its current-month cap.
3. **"Agregar gasto" adapts to a future month.** While Home shows a future
   month the form opens with "Ya lo pagué" unchecked and the date on the 1st
   of that month. Checking "Ya lo pagué" pulls a future date back to today,
   since a paid gasto cannot be dated in the future. The onboarding
   checklist opens the same sheet, so it follows the viewed month too.
4. **Minimal Home changes for a future month.** The spent card's label is
   "Gastos del mes" in every month (it read "Gastos de este mes", already
   wrong for past months). "Últimos gastos del mes" is hidden in a future
   month: paid gastos cannot be future-dated, so it is always empty there.
   No other visual cue -- the pager already names the month.
