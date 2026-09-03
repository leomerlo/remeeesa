import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertMessage } from '@/components/ui/alert-message'
import { useEffect, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { CategoryChips } from './CategoryChips'
import { CategoryCombobox } from './CategoryCombobox'
import {
  createExpense,
  deleteExpense,
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
import { membersQueryKey } from '@/features/household'
import { listHouseholdMembers } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { categoriesQueryKey, expensesQueryKey } from './queryKeys'

export type EditExpenseTarget = {
  readonly expenseId: string
  readonly name: string
  readonly price: number
  readonly categoryName: string
  readonly comments: string
  readonly expenseDate: Date
  // Who this Expense is currently attributed to -- lets the edit form
  // pre-select the right row in the author picker.
  readonly memberId: string
  // Whether this Expense is already linked to a real Pendiente -- when it
  // is, "servicio" is derived from that link and the manual toggle below is
  // hidden, since editing it here couldn't change anything.
  readonly pendienteId: string | null
  readonly isService: boolean
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
    throw new Error('La fecha del gasto no es válida')
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
    throw new Error('La fecha del gasto no es válida')
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
    return 'Este gasto ya no existe'
  }
  if (error instanceof Error) {
    return error.message
  }
  return mode === 'edit'
    ? 'No se pudo guardar el gasto'
    : 'No se pudo agregar el gasto'
}

function loadErrorMessage(error: unknown): string | null {
  if (error === null || error === undefined) {
    return null
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'No se pudo cargar las categorías'
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
  const expensesKey = expensesQueryKey({ householdId })
  const [name, setName] = useState(initialFields.name)
  const [price, setPrice] = useState(initialFields.price)
  const [category, setCategory] = useState(initialFields.category)
  const [comments, setComments] = useState(initialFields.comments)
  const [date, setDate] = useState(initialFields.date)
  const [authorMemberId, setAuthorMemberId] = useState(
    editExpense?.memberId ?? memberId,
  )
  const [isService, setIsService] = useState(editExpense?.isService ?? false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const today = localDateInputValue(new Date())

  // Only fetched for reassigning an existing Expense's author -- adding one
  // always attributes it to whoever is signed in, same as before this
  // feature existed.
  const membersQuery = useQuery({
    queryKey: membersQueryKey({ householdId }),
    queryFn: () => listHouseholdMembers({ db, householdId }),
    enabled: isEditing,
  })
  const members = membersQuery.data ?? []

  async function invalidateExpenseViews(): Promise<void> {
    // Categories are a separate entity from expenses, so they keep their
    // own exact-key invalidation. The expenses prefix invalidates every
    // consumer nested under it (month-scoped, recent) in one call.
    await queryClient.invalidateQueries({ queryKey: categoriesKey })
    await queryClient.invalidateQueries({ queryKey: expensesKey })
  }

  const mutation = useMutation({
    mutationFn: async (fields: ParsedExpenseFields) => {
      const resolved = await findOrCreateCategory({
        db,
        householdId,
        name: fields.categoryName,
      })
      if (editExpense !== null) {
        // Falls back to leaving attribution unchanged if the member list
        // hasn't resolved yet by the time this submits (the query starts
        // fetching the moment the edit form mounts, so this is a narrow
        // window) -- updateExpense's memberId/authorDisplayName are
        // optional precisely for this "nothing to reassign to yet" case.
        const selectedAuthor = members.find(
          (member) => member.userId === authorMemberId,
        )
        return updateExpense({
          db,
          householdId,
          expenseId: editExpense.expenseId,
          categoryId: resolved.id,
          name: fields.name,
          price: fields.price,
          comments: fields.comments,
          expenseDate: fields.expenseDate,
          // Only ever offered (and only ever meaningful) when the Expense
          // isn't already linked to a real Pendiente -- see the toggle's
          // render guard below.
          ...(editExpense.pendienteId === null ? { isService } : {}),
          ...(selectedAuthor === undefined
            ? {}
            : {
                memberId: selectedAuthor.userId,
                authorDisplayName: selectedAuthor.displayName,
              }),
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
        setError('Este gasto ya no existe')
        await invalidateExpenseViews()
      }
    },
  })

  // Deleting lives here (inside the edit form) rather than on the
  // "Últimos movimientos" row itself -- the approved comp shows those rows
  // as plain, buttonless cards, so the only affordance left on a row is
  // tapping it open to edit.
  //
  // Invalidates only expensesKey, not categoriesKey (unlike the save
  // mutation above) -- deleting can never create a category, only
  // findOrCreateCategory (used by add/edit) can, so there's nothing on the
  // categories cache a delete would ever need to refresh.
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (editExpense === null) {
        throw new Error('No hay un gasto para eliminar')
      }
      await deleteExpense({
        db,
        householdId,
        expenseId: editExpense.expenseId,
      })
    },
    onSuccess: async () => {
      setConfirmingDelete(false)
      onEditFinished?.()
      await queryClient.invalidateQueries({ queryKey: expensesKey })
    },
    onError: async (caught) => {
      setConfirmingDelete(false)
      if (caught instanceof ExpenseNotFoundError) {
        setError('Este gasto ya no existe')
        await queryClient.invalidateQueries({ queryKey: expensesKey })
        return
      }
      const message =
        caught instanceof Error
          ? caught.message
          : 'No se pudo eliminar el gasto'
      setError(message)
    },
  })

  // Lets a container (e.g. AddExpenseSheet) keep the form mounted while a
  // submit is in flight, so a dismiss can't abandon a pending mutation and
  // silently swallow its result.
  useEffect(() => {
    onPendingChange?.(mutation.isPending || deleteMutation.isPending)
  }, [mutation.isPending, deleteMutation.isPending, onPendingChange])

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
        caught instanceof Error ? caught.message : 'No se pudo agregar el gasto'
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
      className="flex h-full min-h-0 w-full flex-col"
      noValidate
      onSubmit={onSubmit}
    >
      {/* Only this part scrolls -- the action buttons below stay pinned at
          the bottom of the sheet regardless of how tall the field list
          gets, so Guardar/Agregar never requires scrolling to reach. */}
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto overscroll-contain">
        {/* The Sheet's title is visually hidden (it exists for the dialog's
            accessible name), which left the sheet opening onto a bare "Nombre"
            field with nothing saying what it was. */}
        <h2 className="text-title font-semibold">
          {isEditing ? 'Editar gasto' : 'Agregar gasto'}
        </h2>
        {/* The amount leads, at hero size. It is the one field every single
            expense has to fill, and it used to be the fourth identical grey box
            down the sheet -- indistinguishable from "Comentario". */}
        <div className="flex w-full flex-col gap-2">
          <Label
            htmlFor="expense-price"
            className="text-muted-foreground font-medium"
          >
            Precio
          </Label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="text-muted-foreground font-display text-display pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
            >
              $
            </span>
            <FormattedAmountInput
              id="expense-price"
              name="expense-price"
              className="font-display text-display h-20 pl-12 tracking-tight"
              value={price}
              onChange={setPrice}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex w-full flex-col gap-2">
          <Label
            htmlFor="expense-name"
            className="text-muted-foreground font-medium"
          >
            Nombre
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
            htmlFor="expense-category"
            className="text-muted-foreground font-medium"
          >
            Categoría
          </Label>
          <CategoryChips
            categories={categories}
            value={category}
            onChange={setCategory}
          />
          {/* Still here, and still the only way to create a category that does
              not exist yet -- the chips above cover the common case. */}
          <CategoryCombobox
            id="expense-category"
            categories={categories}
            value={category}
            onChange={setCategory}
            placeholder="O escribí una categoría nueva"
          />
        </div>

        <div className="flex w-full flex-col gap-2">
          <Label
            htmlFor="expense-comments"
            className="text-muted-foreground font-medium"
          >
            Comentario
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
            Fecha
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

        {/* Editing only -- adding always attributes the expense to
            whoever is signed in. Lets a member fix an expense that was
            logged under the wrong name, without deleting and re-adding it. */}
        {isEditing && members.length > 0 ? (
          <div className="flex w-full flex-col gap-2">
            <Label
              htmlFor="expense-author"
              className="text-muted-foreground font-medium"
            >
              Autor
            </Label>
            <select
              id="expense-author"
              name="expense-author"
              value={authorMemberId}
              onChange={(event) => {
                setAuthorMemberId(event.target.value)
              }}
              className="border-input bg-background h-12 rounded-lg border px-3 text-sm"
            >
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {/* Only offered when the Expense isn't already linked to a real
            Pendiente -- that link (pendienteId) already determines
            "servicio" on its own, so there'd be nothing for this toggle to
            change. This is the only way to reclassify an Expense that
            predates pendienteId, or one logged as a plain Gasto that
            should have gone through Pendientes. */}
        {isEditing && editExpense.pendienteId === null ? (
          <div className="flex w-full items-center justify-between gap-2">
            <Label htmlFor="expense-is-service" className="font-medium">
              Marcar como servicio
            </Label>
            <Switch
              id="expense-is-service"
              checked={isService}
              onCheckedChange={setIsService}
            />
          </div>
        ) : null}

        {alertMessage !== null ? (
          <AlertMessage>{alertMessage}</AlertMessage>
        ) : null}
      </div>

      <div className="shrink-0 pt-6">
        {confirmingDelete ? (
          <div
            role="alertdialog"
            aria-labelledby="delete-expense-title"
            className="bg-card shadow-raised flex w-full flex-col gap-4 rounded-2xl border border-border p-4"
          >
            <p id="delete-expense-title" className="text-sm font-medium">
              ¿Eliminar el gasto?
            </p>
            <div className="flex w-full gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  setConfirmingDelete(false)
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  deleteMutation.mutate()
                }}
              >
                Eliminar gasto
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center gap-2">
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="w-full"
            >
              {isEditing ? 'Guardar cambios' : 'Agregar gasto'}
            </Button>
            {isEditing ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={mutation.isPending}
                  className="w-full"
                  onClick={() => {
                    setError(null)
                    onEditFinished?.()
                  }}
                >
                  Cancelar edición
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-error hover:text-error"
                  disabled={mutation.isPending}
                  onClick={() => {
                    setError(null)
                    setConfirmingDelete(true)
                  }}
                >
                  Eliminar gasto
                </Button>
              </>
            ) : null}
          </div>
        )}
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
