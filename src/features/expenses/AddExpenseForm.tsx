import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createExpense,
  findOrCreateCategory,
  listCategories,
  parseCategoryName,
  parseExpenseDate,
  parseExpenseName,
  parseExpensePrice,
} from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import {
  categoriesQueryKey,
  expenseListQueryKey,
  expensesInMonthQueryKey,
} from './queryKeys'

export type AddExpenseFormProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly memberId: string
  readonly authorDisplayName: string
}

function localDateInputValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateInput(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) {
    throw new Error('Expense date must be a valid date')
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error('Expense date must be a valid date')
  }
  return date
}

type ParsedExpenseFields = {
  readonly name: string
  readonly price: number
  readonly categoryName: string
  readonly comments: string
  readonly expenseDate: Date
}

function parseExpenseFields(input: {
  readonly name: string
  readonly price: string
  readonly category: string
  readonly comments: string
  readonly date: string
}): ParsedExpenseFields {
  return {
    name: parseExpenseName(input.name),
    price: parseExpensePrice(Number(input.price.trim())),
    categoryName: parseCategoryName(input.category),
    comments: input.comments,
    expenseDate: parseExpenseDate(parseDateInput(input.date)),
  }
}

export function AddExpenseForm({
  db,
  householdId,
  memberId,
  authorDisplayName,
}: AddExpenseFormProps): ReactElement {
  const queryClient = useQueryClient()
  const categoriesKey = categoriesQueryKey({ householdId })
  const expensesKey = expensesInMonthQueryKey({ householdId })
  const expenseListKey = expenseListQueryKey({
    householdId,
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  })
  const categoriesQuery = useQuery({
    queryKey: categoriesKey,
    queryFn: () => listCategories({ db, householdId }),
  })
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('')
  const [comments, setComments] = useState('')
  const [date, setDate] = useState(() => localDateInputValue(new Date()))
  const [error, setError] = useState<string | null>(null)
  const today = localDateInputValue(new Date())

  const mutation = useMutation({
    mutationFn: async (fields: ParsedExpenseFields) => {
      const resolved = await findOrCreateCategory({
        db,
        householdId,
        name: fields.categoryName,
      })
      return createExpense({
        db,
        householdId,
        categoryId: resolved.id,
        memberId,
        authorDisplayName,
        name: fields.name,
        price: fields.price,
        comments: fields.comments,
        expenseDate: fields.expenseDate,
      })
    },
    onSuccess: async () => {
      setName('')
      setPrice('')
      setCategory('')
      setComments('')
      setDate(localDateInputValue(new Date()))
      setError(null)
      await queryClient.invalidateQueries({ queryKey: categoriesKey })
      await queryClient.invalidateQueries({ queryKey: expensesKey })
      await queryClient.invalidateQueries({ queryKey: expenseListKey })
    },
  })

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    try {
      const fields = parseExpenseFields({
        name,
        price,
        category,
        comments,
        date,
      })
      setError(null)
      mutation.mutate(fields)
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'Could not add expense'
      setError(message)
    }
  }

  const alertMessage =
    error ??
    (mutation.error instanceof Error
      ? mutation.error.message
      : mutation.isError
        ? 'Could not add expense'
        : null)

  return (
    <form
      className="flex w-full flex-col items-center gap-8"
      noValidate
      onSubmit={onSubmit}
    >
      <div className="flex w-full flex-col gap-2">
        <Label
          htmlFor="expense-name"
          className="text-muted-foreground font-medium"
        >
          Name
        </Label>
        <Input
          id="expense-name"
          name="expense-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
          }}
          autoComplete="off"
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <Label
          htmlFor="expense-price"
          className="text-muted-foreground font-medium"
        >
          Price
        </Label>
        <Input
          id="expense-price"
          name="expense-price"
          value={price}
          onChange={(event) => {
            setPrice(event.target.value)
          }}
          inputMode="decimal"
          autoComplete="off"
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <Label
          htmlFor="expense-category"
          className="text-muted-foreground font-medium"
        >
          Category
        </Label>
        <Input
          id="expense-category"
          name="expense-category"
          list="expense-categories"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value)
          }}
          autoComplete="off"
        />
        <datalist id="expense-categories">
          {(categoriesQuery.data ?? []).map((item) => (
            <option key={item.id} value={item.name} />
          ))}
        </datalist>
      </div>

      <div className="flex w-full flex-col gap-2">
        <Label
          htmlFor="expense-comments"
          className="text-muted-foreground font-medium"
        >
          Comments
        </Label>
        <Input
          id="expense-comments"
          name="expense-comments"
          value={comments}
          onChange={(event) => {
            setComments(event.target.value)
          }}
          autoComplete="off"
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <Label
          htmlFor="expense-date"
          className="text-muted-foreground font-medium"
        >
          Date
        </Label>
        <Input
          id="expense-date"
          name="expense-date"
          type="date"
          value={date}
          max={today}
          onChange={(event) => {
            setDate(event.target.value)
          }}
        />
      </div>

      {alertMessage !== null ? (
        <p role="alert" className="text-sm font-medium">
          {alertMessage}
        </p>
      ) : null}

      <Button type="submit" disabled={mutation.isPending}>
        Add expense
      </Button>
    </form>
  )
}
