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

1. **Recurring services are carried over by hand.** Paying a recurring
   Pendiente no longer creates next month's cycle: on Servicios, "Pasar
   recurrentes" lists the previous month's recurring bills as a checklist
   and creates the ticked ones in the viewed month (ones already there are
   listed but locked). Creating cycles on payment left a bill twice in a
   month whenever a payment was undone and redone.
   *Known limit:* next month shows nothing recurring until someone carries
   the bills over, so its "Presupuesto restante" is optimistic until then.
   Projecting cycles in memory ("Previsto") was tried and dropped in favour
   of the explicit step.
2. **Home pages forward one month only.** `MonthPager`'s `allowFuture`
   boolean becomes `maxMonthsAhead` (0 by default, 1 on Home, unbounded on
   Servicios). Two months ahead would be empty, since services are only
   carried one month at a time. Categorías keeps its current-month cap.
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
