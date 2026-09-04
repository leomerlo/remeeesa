import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cssVars } from '@/lib/cssVars'
import { householdQueryKey } from '@/features/household'
import {
  budgetGradient,
  computePendingCommitted,
  computePercentUsed,
  computeRemainingBudget,
  currentMonthRange,
  formatBudgetAmount,
  listExpensesInMonth,
} from '@/lib/expenses'
import { listPendientes, pendientesDueInMonth } from '@/lib/pendientes'
import { pendientesQueryKey } from '@/features/pendientes'
import { getHousehold } from '@/lib/households'
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
    // Flat rather than the eventual gradient: a pulsing grey bar over the
    // bright purple would read as broken, not loading. The gradient (and
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

  const pendingCommitted = computePendingCommitted(
    pendientesDueInMonth(pending, monthStart, monthEnd),
  )
  const remaining = computeRemainingBudget(
    household.monthlyBudget,
    expenses,
    pendingCommitted,
  )
  const formattedRemaining = formatBudgetAmount(remaining)
  const percentUsed = computePercentUsed(
    household.monthlyBudget,
    expenses,
    pendingCommitted,
  )
  const gradient = budgetGradient(percentUsed)

  return (
    <div
      // The card's own colour tracks how much of the budget is gone --
      // violet while there is room, red as it runs out. Inline rather than a
      // class because the two stops are computed per render; see
      // lib/expenses/budgetHeat.
      style={cssVars({
        '--budget-from': gradient.from,
        '--budget-to': gradient.to,
      })}
      className="relative flex w-full flex-col gap-6 rounded-3xl bg-[linear-gradient(to_bottom_right,var(--budget-from),var(--budget-to))] p-6 transition-[background-image] duration-500"
    >
      {/* Deliberately no overflow-hidden: the illustration is meant to poke
          past the card edge, and clipping it cut off half of it.

          On a phone it overhangs the top, where this card sits under the
          "Gastos de este mes" card and there is room. From `lg` the two cards
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
        <span className="text-primary-foreground text-xs font-medium">
          {percentUsed}% usado
        </span>
      </div>
    </div>
  )
}
