import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import {
  deleteExpense,
  ExpenseNotFoundError,
  listCategories,
  listExpensesInMonth,
} from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import type { Expense } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { EmptyExpensesIllustration } from './EmptyExpensesIllustration'
import { expenseListQueryKey, expensesInMonthQueryKey } from './queryKeys'

export type ExpenseListProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly onEditExpense?: (expense: Expense, categoryName: string) => void
}

const EXPENSE_GONE_MESSAGE = 'Este gasto ya no existe'

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
  return date.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatExpensePrice(price: number): string {
  return price.toFixed(2)
}

function DeleteExpenseDialog(input: {
  readonly expense: Expense
  readonly isPending: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => void
}): ReactElement {
  const titleId = `delete-expense-title-${input.expense.id}`
  const descriptionId = `delete-expense-description-${input.expense.id}`

  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="bg-card shadow-raised flex flex-col gap-4 rounded-2xl border border-border p-4"
    >
      <div className="flex flex-col gap-1">
        <p id={titleId} className="text-sm font-medium">
          ¿Eliminar el gasto?
        </p>
        <p id={descriptionId} className="text-sm">
          {input.expense.name}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={input.isPending}
          onClick={input.onCancel}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={input.isPending}
          onClick={input.onConfirm}
        >
          Eliminar gasto
        </Button>
      </div>
    </div>
  )
}

export function ExpenseList({
  db,
  householdId,
  onEditExpense,
}: ExpenseListProps): ReactElement {
  const queryClient = useQueryClient()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const expenseListKey = expenseListQueryKey({ householdId, year, month })
  const expensesInMonthKey = expensesInMonthQueryKey({ householdId })
  const [confirmDeleteExpense, setConfirmDeleteExpense] =
    useState<Expense | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const expensesQuery = useQuery({
    queryKey: expenseListKey,
    queryFn: async () => {
      const { monthStart, monthEnd } = calendarMonthRange({ year, month })
      const [expenses, categories] = await Promise.all([
        listExpensesInMonth({ db, householdId, monthStart, monthEnd }),
        listCategories({ db, householdId }),
      ])
      return { expenses, categories }
    },
  })

  async function invalidateExpenseQueries(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: expenseListKey })
    await queryClient.invalidateQueries({ queryKey: expensesInMonthKey })
  }

  const deleteMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      await deleteExpense({ db, householdId, expenseId })
    },
    onSuccess: async () => {
      setConfirmDeleteExpense(null)
      setDeleteError(null)
      await invalidateExpenseQueries()
    },
    onError: async (error) => {
      if (error instanceof ExpenseNotFoundError) {
        setConfirmDeleteExpense(null)
        setDeleteError(EXPENSE_GONE_MESSAGE)
        await invalidateExpenseQueries()
        return
      }
      const message =
        error instanceof Error ? error.message : 'No se pudo eliminar el gasto'
      setDeleteError(message)
    },
  })

  if (expensesQuery.isPending) {
    return (
      <p role="status" className="text-sm font-medium">
        Cargando…
      </p>
    )
  }

  if (expensesQuery.isError) {
    const message =
      expensesQuery.error instanceof Error
        ? expensesQuery.error.message
        : 'No se pudieron cargar los gastos'
    return (
      <p role="alert" className="text-sm font-medium">
        {message}
      </p>
    )
  }

  const { expenses, categories } = expensesQuery.data
  if (expenses.length === 0) {
    return (
      <>
        {deleteError !== null ? (
          <p
            role="alert"
            aria-label={deleteError}
            className="mb-4 text-sm font-medium"
          >
            {deleteError}
          </p>
        ) : null}
        <EmptyExpensesIllustration className="mx-auto h-32 w-40" />
        <p role="status" className="text-sm font-medium">
          No hay gastos este mes
        </p>
      </>
    )
  }

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )

  return (
    <>
      {deleteError !== null ? (
        <p
          role="alert"
          aria-label={deleteError}
          className="mb-4 text-sm font-medium"
        >
          {deleteError}
        </p>
      ) : null}
      <ul
        aria-label="Gastos de este mes"
        className="flex w-full flex-col gap-8 text-sm"
      >
        {expenses.map((expense) => {
          const category = categoryById.get(expense.categoryId)
          const categoryName = category?.name ?? 'Categoría desconocida'
          const categoryColor =
            category?.color ?? colorForCategoryName(categoryName)

          const isConfirmingDelete = confirmDeleteExpense?.id === expense.id

          return (
            <li
              key={expense.id}
              className={
                isConfirmingDelete
                  ? 'bg-card shadow-resting flex flex-col gap-3 rounded-2xl p-4'
                  : 'bg-card shadow-resting flex items-center gap-3 rounded-2xl p-4'
              }
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  data-testid="category-icon"
                  className="size-10 shrink-0 rounded-full"
                  style={{ backgroundColor: categoryColor }}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-foreground font-medium">
                      {expense.name}
                    </span>
                    <span className="font-display text-lg text-foreground">
                      {formatExpensePrice(expense.price)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
                    <span>{categoryName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatExpenseDate(expense.expenseDate)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{expense.authorDisplayName}</span>
                  </div>
                </div>
                {isConfirmingDelete ? null : (
                  <div className="flex shrink-0 gap-2">
                    {onEditExpense !== undefined ? (
                      <Button
                        type="button"
                        variant="outline"
                        aria-label={`Editar ${expense.name}`}
                        onClick={() => {
                          onEditExpense(expense, category?.name ?? '')
                        }}
                      >
                        Editar
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={`Eliminar ${expense.name}`}
                      onClick={() => {
                        setDeleteError(null)
                        setConfirmDeleteExpense(expense)
                      }}
                    >
                      Eliminar
                    </Button>
                  </div>
                )}
              </div>
              {isConfirmingDelete ? (
                <DeleteExpenseDialog
                  expense={expense}
                  isPending={deleteMutation.isPending}
                  onCancel={() => {
                    setConfirmDeleteExpense(null)
                  }}
                  onConfirm={() => {
                    deleteMutation.mutate(expense.id)
                  }}
                />
              ) : null}
            </li>
          )
        })}
      </ul>
    </>
  )
}
