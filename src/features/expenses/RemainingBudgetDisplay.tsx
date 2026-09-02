import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
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
}

export function RemainingBudgetDisplay({
  db,
  householdId,
}: RemainingBudgetDisplayProps): ReactElement {
  const householdQuery = useQuery({
    queryKey: householdQueryKey({ householdId }),
    queryFn: () => getHousehold({ db, householdId }),
  })
  const monthRange = useMemo(() => currentMonthRange(), [])
  const expensesQuery = useQuery({
    queryKey: expensesInMonthQueryKey({ householdId }),
    queryFn: () =>
      listExpensesInMonth({
        db,
        householdId,
        monthStart: monthRange.monthStart,
        monthEnd: monthRange.monthEnd,
      }),
  })
  const household = householdQuery.data
  const expenses = expensesQuery.data

  if (household === undefined || expenses === undefined) {
    return (
      <div className="bg-card shadow-resting flex w-full flex-col items-center gap-2 rounded-3xl p-8">
        <p role="status" className="text-sm font-medium">
          Cargando…
        </p>
      </div>
    )
  }

  const remaining = computeRemainingBudget(household.monthlyBudget, expenses)
  const formattedRemaining = formatBudgetAmount(remaining)
  const percentUsed = computePercentUsed(household.monthlyBudget, expenses)

  return (
    <div className="from-primary to-[var(--surface-action-gradient-end)] relative flex w-full flex-col gap-6 rounded-3xl bg-gradient-to-br p-6">
      {/* Deliberately no overflow-hidden: the illustration is meant to poke
          above the card edge, and clipping it cut off its top half. The
          overhang is small on purpose -- at -top-14/h-20 it reached 56px above
          the card and collided with the page title, which sits only one gap
          (32px) higher. */}
      <PiggyBankIllustration className="pointer-events-none absolute -top-7 right-2 h-16 w-20" />
      <div className="flex flex-col gap-2 pr-16">
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
