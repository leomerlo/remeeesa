import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { listCategories, listExpensesInMonth } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'

export type ExpenseListProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
}

function calendarMonthRange(input: {
  readonly year: number
  readonly month: number
}): {
  readonly monthStart: Date
  readonly monthEnd: Date
} {
  return {
    monthStart: new Date(input.year, input.month, 1),
    monthEnd: new Date(input.year, input.month + 1, 0, 23, 59, 59, 999),
  }
}

function formatExpenseDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatExpensePrice(price: number): string {
  return price.toFixed(2)
}

export function ExpenseList({
  db,
  householdId,
}: ExpenseListProps): ReactElement {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const expensesQuery = useQuery({
    queryKey: ['expense-list', householdId, year, month],
    queryFn: async () => {
      const { monthStart, monthEnd } = calendarMonthRange({ year, month })
      const [expenses, categories] = await Promise.all([
        listExpensesInMonth({ db, householdId, monthStart, monthEnd }),
        listCategories({ db, householdId }),
      ])
      return { expenses, categories }
    },
  })

  if (expensesQuery.isPending) {
    return (
      <p role="status" className="text-sm font-medium">
        Loading…
      </p>
    )
  }

  if (expensesQuery.isError) {
    const message =
      expensesQuery.error instanceof Error
        ? expensesQuery.error.message
        : 'Could not load expenses'
    return (
      <p role="alert" className="text-sm font-medium">
        {message}
      </p>
    )
  }

  const { expenses, categories } = expensesQuery.data
  if (expenses.length === 0) {
    return (
      <p role="status" className="text-sm font-medium">
        No expenses this month
      </p>
    )
  }

  const categoryNameById = new Map(
    categories.map((category) => [category.id, category.name]),
  )

  return (
    <ul
      aria-label="This month's expenses"
      className="flex w-full flex-col gap-8 text-sm"
    >
      {expenses.map((expense) => (
        <li key={expense.id} className="flex flex-col gap-1">
          <span>{expense.name}</span>
          <span>{formatExpensePrice(expense.price)}</span>
          <span>
            {categoryNameById.get(expense.categoryId) ?? 'Unknown category'}
          </span>
          <span>{formatExpenseDate(expense.expenseDate)}</span>
          <span>{expense.authorDisplayName}</span>
        </li>
      ))}
    </ul>
  )
}
