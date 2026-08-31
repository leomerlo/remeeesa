import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CategoryCombobox } from './CategoryCombobox'
import {
  createExpense,
  ExpenseNotFoundError,
  findOrCreateCategory,
  listCategories,
  parseCategoryName,
  parseExpenseDate,
  parseExpenseName,
  parseExpensePrice,
  updateExpense,
} from '@/lib/expenses'
import type { Category } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import {
  categoriesQueryKey,
  expenseListQueryKey,
  expensesInMonthQueryKey,
} from './queryKeys'

export type EditExpenseTarget = {
  readonly expenseId: string
  readonly name: string
  readonly price: number
  readonly categoryName: string
  readonly comments: string
  readonly expenseDate: Date
}

export type AddExpenseFormProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly editExpense?: EditExpenseTarget | null
  readonly onEditFinished?: () => void
  readonly onAdded?: () => void
  readonly onPendingChange?: (pending: boolean) => void
}

type ExpenseFormFields = {
  readonly name: string
  readonly price: string
  readonly category: string
  readonly comments: string
  readonly date: string
}

function localDateInputValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function emptyFormFields(): ExpenseFormFields {
  return {
    name: '',
    price: '',
    category: '',
    comments: '',
    date: localDateInputValue(new Date()),
  }
}

function formFieldsFromEdit(editExpense: EditExpenseTarget): ExpenseFormFields {
  return {
    name: editExpense.name,
    price: String(editExpense.price),
    category: editExpense.categoryName,
    comments: editExpense.comments,
    date: localDateInputValue(editExpense.expenseDate),
  }
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

function parseExpenseFields(input: ExpenseFormFields): ParsedExpenseFields {
  return {
    name: parseExpenseName(input.name),
    price: parseExpensePrice(Number(input.price.trim())),
    categoryName: parseCategoryName(input.category),
    comments: input.comments,
    expenseDate: parseExpenseDate(parseDateInput(input.date)),
  }
}

function mutationErrorMessage(error: unknown, mode: 'add' | 'edit'): string {
  if (error instanceof ExpenseNotFoundError) {
    return 'This expense no longer exists'
  }
  if (error instanceof Error) {
    return error.message
  }
  return mode === 'edit' ? 'Could not save expense' : 'Could not add expense'
}

function loadErrorMessage(error: unknown): string | null {
  if (error === null || error === undefined) {
    return null
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Could not load categories'
}

type ExpenseFormBodyProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly editExpense: EditExpenseTarget | null
  readonly initialFields: ExpenseFormFields
  readonly categories: readonly Category[]
  readonly loadError: string | null
  readonly onEditFinished?: () => void
  readonly onAdded?: () => void
  readonly onPendingChange?: (pending: boolean) => void
}

function ExpenseFormBody({
  db,
  householdId,
  memberId,
  authorDisplayName,
  editExpense,
  initialFields,
  categories,
  loadError,
  onEditFinished,
  onAdded,
  onPendingChange,
}: ExpenseFormBodyProps): ReactElement {
  const isEditing = editExpense !== null
  const queryClient = useQueryClient()
  const categoriesKey = categoriesQueryKey({ householdId })
  const expensesKey = expensesInMonthQueryKey({ householdId })
  const expenseListKey = expenseListQueryKey({
    householdId,
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  })
  const [name, setName] = useState(initialFields.name)
  const [price, setPrice] = useState(initialFields.price)
  const [category, setCategory] = useState(initialFields.category)
  const [comments, setComments] = useState(initialFields.comments)
  const [date, setDate] = useState(initialFields.date)
  const [error, setError] = useState<string | null>(null)
  const today = localDateInputValue(new Date())

  async function invalidateExpenseViews(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: categoriesKey })
    await queryClient.invalidateQueries({ queryKey: expensesKey })
    await queryClient.invalidateQueries({ queryKey: expenseListKey })
  }

  const mutation = useMutation({
    mutationFn: async (fields: ParsedExpenseFields) => {
      const resolved = await findOrCreateCategory({
        db,
        householdId,
        name: fields.categoryName,
      })
      if (editExpense !== null) {
        return updateExpense({
          db,
          householdId,
          expenseId: editExpense.expenseId,
          categoryId: resolved.id,
          name: fields.name,
          price: fields.price,
          comments: fields.comments,
          expenseDate: fields.expenseDate,
        })
      }
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
      if (isEditing) {
        onEditFinished?.()
      } else {
        setName('')
        setPrice('')
        setCategory('')
        setComments('')
        setDate(localDateInputValue(new Date()))
        onAdded?.()
      }
      setError(null)
      await invalidateExpenseViews()
    },
    onError: async (caught) => {
      if (caught instanceof ExpenseNotFoundError) {
        setError('This expense no longer exists')
        await invalidateExpenseViews()
      }
    },
  })

  // Lets a container (e.g. AddExpenseSheet) keep the form mounted while a
  // submit is in flight, so a dismiss can't abandon a pending mutation and
  // silently swallow its result.
  useEffect(() => {
    onPendingChange?.(mutation.isPending)
  }, [mutation.isPending, onPendingChange])

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
    (mutation.isError && !(mutation.error instanceof ExpenseNotFoundError)
      ? mutationErrorMessage(mutation.error, isEditing ? 'edit' : 'add')
      : null) ??
    loadError

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
        <CategoryCombobox
          id="expense-category"
          categories={categories}
          value={category}
          onChange={setCategory}
        />
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

      <div className="flex w-full flex-col items-center gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {isEditing ? 'Save changes' : 'Add expense'}
        </Button>
        {isEditing ? (
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => {
              setError(null)
              onEditFinished?.()
            }}
          >
            Cancel edit
          </Button>
        ) : null}
      </div>
    </form>
  )
}

export function AddExpenseForm({
  db,
  householdId,
  memberId,
  authorDisplayName,
  editExpense = null,
  onEditFinished,
  onAdded,
  onPendingChange,
}: AddExpenseFormProps): ReactElement {
  const categoriesKey = categoriesQueryKey({ householdId })
  const categoriesQuery = useQuery({
    queryKey: categoriesKey,
    queryFn: () => listCategories({ db, householdId }),
  })
  const initialFields =
    editExpense === null ? emptyFormFields() : formFieldsFromEdit(editExpense)
  const formKey = editExpense?.expenseId ?? 'add'

  return (
    <ExpenseFormBody
      key={formKey}
      db={db}
      householdId={householdId}
      memberId={memberId}
      authorDisplayName={authorDisplayName}
      editExpense={editExpense}
      initialFields={initialFields}
      categories={categoriesQuery.data ?? []}
      loadError={loadErrorMessage(categoriesQuery.error)}
      onEditFinished={onEditFinished}
      onAdded={onAdded}
      onPendingChange={onPendingChange}
    />
  )
}
