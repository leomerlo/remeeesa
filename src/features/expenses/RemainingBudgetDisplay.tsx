import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { householdQueryKey } from '@/features/household'
import {
  computeRemainingBudget,
  currentMonthRange,
  formatBudgetAmount,
  listExpensesInMonth,
} from '@/lib/expenses'
import { getHousehold } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'

export type RemainingBudgetDisplayProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
}

export function expensesInMonthQueryKey(input: {
  readonly householdId: string
}): readonly ['expenses-in-month', string] {
  return ['expenses-in-month', input.householdId]
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

  return (
    <div className="from-primary to-[var(--surface-action-gradient-end)] flex w-full flex-col items-center gap-2 rounded-3xl bg-gradient-to-br p-8">
      <span className="text-primary-foreground text-body font-medium [text-shadow:0_1px_3px_rgba(0,0,0,0.35)]">
        Presupuesto restante
      </span>
      <p
        role="status"
        aria-label={`Presupuesto restante ${formattedRemaining}`}
        className="text-primary-foreground font-display text-display tracking-tight [text-shadow:0_1px_4px_rgba(0,0,0,0.35)]"
      >
        {formattedRemaining}
      </p>
    </div>
  )
}
