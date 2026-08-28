import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { Label } from '@/components/ui/label'
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
      <p role="status" className="text-sm font-medium">
        Loading…
      </p>
    )
  }

  const remaining = computeRemainingBudget(household.monthlyBudget, expenses)
  const formattedRemaining = formatBudgetAmount(remaining)

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <Label className="text-muted-foreground font-medium">
        Remaining budget
      </Label>
      <p
        role="status"
        aria-label={`Remaining budget ${formattedRemaining}`}
        className="font-display text-5xl tracking-tight"
      >
        {formattedRemaining}
      </p>
    </div>
  )
}
