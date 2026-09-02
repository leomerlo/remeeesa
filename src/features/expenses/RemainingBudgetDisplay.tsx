import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { householdQueryKey } from '@/features/household'
import {
  computePercentUsed,
  computeRemainingBudget,
  currentMonthRange,
  formatBudgetAmount,
  listExpensesInMonth,
} from '@/lib/expenses'
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
  const household = householdQuery.data
  const expenses = expensesQuery.data

  if (household === undefined || expenses === undefined) {
    // Flat rather than the eventual gradient: a pulsing grey bar over the
    // bright purple would read as broken, not loading. The gradient (and
    // the mascot) only appear once there's a real figure to show inside it.
    return (
      <div
        role="status"
        aria-label="Cargando…"
        className="bg-card shadow-resting flex w-full flex-col gap-6 rounded-3xl p-6"
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

  const remaining = computeRemainingBudget(household.monthlyBudget, expenses)
  const formattedRemaining = formatBudgetAmount(remaining)
  const percentUsed = computePercentUsed(household.monthlyBudget, expenses)

  return (
    <div className="from-primary to-[var(--surface-action-gradient-end)] relative flex w-full flex-col gap-6 rounded-3xl bg-gradient-to-br p-6">
      {/* Deliberately no overflow-hidden: the illustration is meant to poke
          above and past the card edge, and clipping it cut off its top half.
          Pushed right into the corner (negative right offset) rather than
          floating further up, since the page wrapper's gap above this card
          shrank to gap-6 (24px) and a taller overhang would collide with the
          page title again. */}
      <PiggyBankIllustration className="pointer-events-none absolute -top-14 -right-3 h-28 w-32" />
      <div className="flex flex-col gap-2 pr-16">
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
      <div className="flex w-full flex-col gap-1">
        <div
          role="progressbar"
          aria-label="% usado"
          aria-valuenow={percentUsed}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full overflow-hidden rounded-full bg-white/30"
        >
          <div
            className="h-full rounded-full bg-white transition-[width]"
            style={{ width: `${String(percentUsed)}%` }}
          />
        </div>
        <span className="text-primary-foreground text-xs font-medium">
          {percentUsed}% usado
        </span>
      </div>
    </div>
  )
}
