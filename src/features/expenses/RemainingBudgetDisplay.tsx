import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { cssVars } from '@/lib/cssVars'
import { householdQueryKey } from '@/features/household'
import {
  budgetColor,
  computePendingCommitted,
  computePercentUsed,
  computeRemainingBudget,
  currentMonthRange,
  formatBudgetAmount,
  formatCurrency,
  listExpensesInMonth,
} from '@/lib/expenses'
import { listPendientes, pendientesDueInMonth } from '@/lib/pendientes'
import { pendientesQueryKey } from '@/features/pendientes'
import { getHousehold, monthlyBudgetFor } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { PiggyBankIllustration } from './PiggyBankIllustration'
import { expensesInMonthQueryKey } from './queryKeys'

export type RemainingBudgetDisplayProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // Defaults to the current month. MonthNavigator passes the month it's
  // paging through instead -- this card has no month-picking UI of its own,
  // it just renders whatever range it's given.
  readonly monthStart?: Date
  readonly monthEnd?: Date
}

export function RemainingBudgetDisplay({
  db,
  householdId,
  monthStart: monthStartProp,
  monthEnd: monthEndProp,
}: RemainingBudgetDisplayProps): ReactElement {
  const householdQuery = useQuery({
    queryKey: householdQueryKey({ householdId }),
    queryFn: () => getHousehold({ db, householdId }),
  })
  const defaultRange = useMemo(() => currentMonthRange(), [])
  const monthStart = monthStartProp ?? defaultRange.monthStart
  const monthEnd = monthEndProp ?? defaultRange.monthEnd
  // The query key changes with the viewed month, so paging keeps each
  // month's expenses cached under its own entry instead of refetching the
  // same month every time it's revisited.
  const expensesQuery = useQuery({
    queryKey: [
      ...expensesInMonthQueryKey({ householdId }),
      monthStart.getTime(),
    ],
    queryFn: () =>
      listExpensesInMonth({
        db,
        householdId,
        monthStart,
        monthEnd,
      }),
  })
  // Per direct feedback: a Pendiente still owed has to count against what's
  // "left" too, but only for the month it's actually due in -- see
  // SpentThisMonthDisplay's identical query for the full reasoning (shares
  // its cache entry).
  const pendingQuery = useQuery({
    queryKey: [...pendientesQueryKey({ householdId }), 'committed'],
    queryFn: () => listPendientes({ db, householdId }),
  })
  const household = householdQuery.data
  const expenses = expensesQuery.data
  const pending = pendingQuery.data

  if (
    household === undefined ||
    expenses === undefined ||
    pending === undefined
  ) {
    // Neutral rather than the eventual heat colour: a pulsing grey bar over
    // the filled card would read as broken, not loading. The colour (and
    // the mascot) only appear once there's a real figure to show inside it.
    return (
      <div
        role="status"
        aria-label="Cargando…"
        className="bg-card flex w-full flex-col gap-6 rounded-3xl p-6"
      >
        <span className="sr-only">Cargando…</span>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-11 w-52" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
    )
  }

  // No budget set (see parseMonthlyBudget: zero is a real state, not an
  // error). There is nothing to count down from, so the card says so and
  // offers to fix it rather than rendering "restante: -$48.350" against a
  // budget of nothing, or a progress bar that is full from the first gasto.
  // Light, not the dark filled one: that card's whole job is showing heat,
  // and with no budget there is no heat to show.
  const monthlyBudget = monthlyBudgetFor(household, monthStart)

  if (monthlyBudget === 0) {
    return (
      // The whole card is the link, and it carries no button of its own: the
      // onboarding checklist directly above this one cannot be finished
      // without a budget, so it is always on screen here with its own "Poner
      // presupuesto" -- two of the same button, a screen apart, reads as a
      // mistake. Dashed and unfilled rather than the solid card the budget
      // gets: it is a slot waiting to be filled, and it sits right under the
      // solid white "Gastos del mes", which it would otherwise merge
      // into. No piggy either -- there is no budget for it to be guarding.
      <Link
        to="/household"
        className="border-border hover:bg-card flex w-full flex-col gap-2 rounded-3xl border-2 border-dashed p-6 transition-colors"
      >
        <span className="text-body font-medium">Presupuesto del mes</span>
        <span className="text-muted-foreground text-sm">
          Todavía no pusiste uno. Ponelo y cada gasto se descuenta de ahí.
        </span>
      </Link>
    )
  }

  const pendingCommitted = computePendingCommitted(
    pendientesDueInMonth(pending, monthStart, monthEnd),
  )
  const remaining = computeRemainingBudget(
    monthlyBudget,
    expenses,
    pendingCommitted,
  )
  const formattedRemaining = formatBudgetAmount(remaining)
  // What the month has taken out of the budget so far, derived from the
  // remainder rather than re-summed, so the two figures on this card can
  // never disagree. Overspending is allowed to read as more than the
  // budget ("$950.000 de $900.000") -- that is the situation.
  const used = monthlyBudget - remaining
  const percentUsed = computePercentUsed(
    monthlyBudget,
    expenses,
    pendingCommitted,
  )
  const heatColor = budgetColor(percentUsed)

  return (
    <div
      // The card's own colour tracks how much of the budget is gone --
      // charcoal while there is room, the danger rose as it runs out. A
      // custom property rather than a class because the colour is computed
      // per render; see lib/expenses/budgetHeat.
      style={cssVars({ '--budget-heat': heatColor })}
      className="relative flex w-full flex-col gap-6 rounded-3xl bg-[var(--budget-heat)] p-6 transition-colors duration-500"
    >
      {/* Deliberately no overflow-hidden: the illustration is meant to poke
          past the card edge, and clipping it cut off half of it.

          On a phone it overhangs the top, where this card sits under the
          "Gastos del mes" card and there is room. From `lg` the two cards
          sit side by side directly under the month pager and that same
          overhang landed on top of the pager's next-month arrow, so there
          it sits centred inside the card's right edge instead -- which the
          wider card has room for, and the phone's does not (centred, it
          would run straight through the amount). Everything to its left
          reserves that width from `lg` up, the progress bar included. */}
      <PiggyBankIllustration className="pointer-events-none absolute -top-14 -right-3 h-28 w-32 lg:top-1/2 lg:right-3 lg:-translate-y-1/2" />
      <div className="flex flex-col gap-2 pr-16 lg:pr-36">
        {/* No month label here -- MonthNavigator (Home's shared control
            above both cards) is the one place that says which month is
            being viewed now; repeating it on every card it renders was
            three copies of the same sentence. */}
        <span className="text-primary-foreground text-body font-medium">
          Presupuesto restante
        </span>
        <p
          role="status"
          aria-label={`Presupuesto restante ${formattedRemaining}`}
          className="text-primary-foreground font-display text-display tracking-tight"
        >
          {formattedRemaining}
        </p>
      </div>
      <div className="flex w-full flex-col gap-1 lg:pr-36">
        <div
          role="progressbar"
          aria-label="% usado"
          aria-valuenow={percentUsed}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full overflow-hidden rounded-full bg-white/30"
        >
          <div
            className="h-full w-[var(--progress)] rounded-full bg-white transition-[width]"
            style={cssVars({ '--progress': `${String(percentUsed)}%` })}
          />
        </div>
        {/* The budget itself, which the card otherwise never states: it
            only ever showed what was left and a percentage, so the figure
            those are measured against was nowhere on screen. Per direct
            feedback. */}
        <div className="text-primary-foreground flex w-full items-baseline justify-between gap-2 text-xs font-medium">
          <span>
            {formatCurrency(used)} de {formatCurrency(monthlyBudget)}
          </span>
          <span className="shrink-0">{percentUsed}% usado</span>
        </div>
      </div>
    </div>
  )
}
