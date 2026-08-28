import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { householdQueryKey } from '@/features/household'
import {
  computeRemainingBudget,
  currentMonthRange,
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

  return (
    <p
      role="status"
      aria-label="Remaining budget"
      className="font-display text-5xl tracking-tight"
    >
      {remaining}
    </p>
  )
}
