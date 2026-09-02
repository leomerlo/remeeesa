import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertMessage } from '@/components/ui/alert-message'
import { useEffect, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  categoriesQueryKey,
  CategoryChips,
  CategoryCombobox,
} from '@/features/expenses'
import {
  createPendiente,
  PendienteAlreadyPaidError,
  PendienteNotFoundError,
  deletePendiente,
  parsePendienteDueDate,
  parsePendienteName,
  parseExpectedAmount,
  updatePendiente,
} from '@/lib/pendientes'
import {
  findOrCreateCategory,
  listCategories,
  parseCategoryName,
} from '@/lib/expenses'
import type { Category } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { pendientesQueryKey } from './queryKeys'

export type EditPendienteTarget = {
  readonly pendienteId: string
  readonly name: string
  readonly categoryName: string
  readonly dueDate: Date
  readonly expectedAmount: number | null
  readonly recurring: boolean
}

export type AddPendienteFormProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly editPendiente?: EditPendienteTarget | null
  readonly onEditFinished?: () => void
  readonly onAdded?: () => void
  readonly onPendingChange?: (pending: boolean) => void
}

type PendienteFormFields = {
  readonly name: string
  readonly category: string
  readonly dueDate: string
  readonly expectedAmount: string
  readonly recurring: boolean
}

function localDateInputValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function emptyFormFields(): PendienteFormFields {
  return {
    name: '',
    category: '',
    dueDate: localDateInputValue(new Date()),
    expectedAmount: '',
    recurring: false,
  }
}

function formFieldsFromEdit(
  editPendiente: EditPendienteTarget,
): PendienteFormFields {
  return {
    name: editPendiente.name,
    category: editPendiente.categoryName,
    dueDate: localDateInputValue(editPendiente.dueDate),
    expectedAmount:
      editPendiente.expectedAmount === null
        ? ''
        : String(editPendiente.expectedAmount),
    recurring: editPendiente.recurring,
  }
}

function parseDateInput(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) {
    throw new Error('La fecha del pendiente no es válida')
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
    throw new Error('La fecha del pendiente no es válida')
  }
  return date
}

type ParsedPendienteFields = {
  readonly name: string
  readonly categoryName: string
  readonly dueDate: Date
  readonly expectedAmount: number | null
  readonly recurring: boolean
}

function parsePendienteFields(
  input: PendienteFormFields,
): ParsedPendienteFields {
  const trimmedAmount = input.expectedAmount.trim()
  return {
    name: parsePendienteName(input.name),
    categoryName: parseCategoryName(input.category),
    dueDate: parsePendienteDueDate(parseDateInput(input.dueDate)),
    // Blank must reach createPendiente/updatePendiente as `null`, not `0` --
    // Number('') is 0, which parseExpectedAmount would reject as
    // non-positive.
    expectedAmount: parseExpectedAmount(
      trimmedAmount === '' ? null : Number(trimmedAmount),
    ),
    recurring: input.recurring,
  }
}

// PendienteNotFoundError/PendienteAlreadyPaidError never reach here -- both close
// the sheet from the mutation's own onError instead of rendering an alert
// (see the `mutation`/`deleteMutation` definitions below).
function mutationErrorMessage(error: unknown, mode: 'add' | 'edit'): string {
  if (error instanceof Error) {
    return error.message
  }
  return mode === 'edit'
    ? 'No se pudo guardar el pendiente'
    : 'No se pudo agregar el pendiente'
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

type PendienteFormBodyProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly editPendiente: EditPendienteTarget | null
  readonly initialFields: PendienteFormFields
  readonly categories: readonly Category[]
  readonly loadError: string | null
  readonly onEditFinished?: () => void
  readonly onAdded?: () => void
  readonly onPendingChange?: (pending: boolean) => void
}

function PendienteFormBody({
  db,
  householdId,
  editPendiente,
  initialFields,
  categories,
  loadError,
  onEditFinished,
  onAdded,
  onPendingChange,
}: PendienteFormBodyProps): ReactElement {
  const isEditing = editPendiente !== null
  const queryClient = useQueryClient()
  const pendientesKey = pendientesQueryKey({ householdId })
  const categoriesKey = categoriesQueryKey({ householdId })
  const [name, setName] = useState(initialFields.name)
  const [category, setCategory] = useState(initialFields.category)
  const [dueDate, setDueDate] = useState(initialFields.dueDate)
  const [expectedAmount, setExpectedAmount] = useState(
    initialFields.expectedAmount,
  )
  const [recurring, setRecurring] = useState(initialFields.recurring)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function invalidatePendienteViews(): Promise<void> {
    // Categories are a separate entity from pendientes, so they keep their own
    // exact-key invalidation, same convention as the expense form.
    await queryClient.invalidateQueries({ queryKey: categoriesKey })
    await queryClient.invalidateQueries({ queryKey: pendientesKey })
  }

  const mutation = useMutation({
    mutationFn: async (fields: ParsedPendienteFields) => {
      const resolvedCategory = await findOrCreateCategory({
        db,
        householdId,
        name: fields.categoryName,
      })
      if (editPendiente !== null) {
        return updatePendiente({
          db,
          householdId,
          pendienteId: editPendiente.pendienteId,
          categoryId: resolvedCategory.id,
          name: fields.name,
          dueDate: fields.dueDate,
          expectedAmount: fields.expectedAmount,
          recurring: fields.recurring,
        })
      }
      return createPendiente({
        db,
        householdId,
        categoryId: resolvedCategory.id,
        name: fields.name,
        dueDate: fields.dueDate,
        expectedAmount: fields.expectedAmount,
        recurring: fields.recurring,
      })
    },
    onSuccess: async () => {
      if (isEditing) {
        onEditFinished?.()
      } else {
        const reset = emptyFormFields()
        setName(reset.name)
        setCategory(reset.category)
        setDueDate(reset.dueDate)
        setExpectedAmount(reset.expectedAmount)
        setRecurring(reset.recurring)
        onAdded?.()
      }
      setError(null)
      await invalidatePendienteViews()
    },
    // A stale Pendiente (deleted, or marked paid, by someone else while this
    // form was open) can't usefully stay open for a retry -- there's
    // nothing left to save over. Invalidate so the pending list reflects
    // reality and close the sheet, the same "can't act on it, so don't
    // block on it" outcome as the delete-on-a-gone-Pendiente case below.
    onError: async (caught) => {
      if (
        caught instanceof PendienteNotFoundError ||
        caught instanceof PendienteAlreadyPaidError
      ) {
        await invalidatePendienteViews()
        onEditFinished?.()
      }
    },
  })

  // Deleting lives here (inside the edit form) rather than on the pending
  // list row itself -- mirrors AddExpenseForm's confirmingDelete pattern.
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (editPendiente === null) {
        throw new Error('No hay un pendiente para eliminar')
      }
      await deletePendiente({
        db,
        householdId,
        pendienteId: editPendiente.pendienteId,
      })
    },
    onSuccess: async () => {
      setConfirmingDelete(false)
      onEditFinished?.()
      await queryClient.invalidateQueries({ queryKey: pendientesKey })
    },
    // A Pendiente that's already gone (or already paid) is the outcome the
    // user wanted anyway -- deleting never touches an Expense, so there is
    // nothing to roll back. Treat it as already-successful rather than
    // surfacing an error the user can't act on.
    onError: async (caught) => {
      setConfirmingDelete(false)
      if (
        caught instanceof PendienteNotFoundError ||
        caught instanceof PendienteAlreadyPaidError
      ) {
        onEditFinished?.()
        await queryClient.invalidateQueries({ queryKey: pendientesKey })
        return
      }
      const message =
        caught instanceof Error
          ? caught.message
          : 'No se pudo eliminar el pendiente'
      setError(message)
    },
  })

  // Lets a container (e.g. AddPendienteSheet) keep the form mounted while a
  // submit is in flight, so a dismiss can't abandon a pending mutation and
  // silently swallow its result.
  useEffect(() => {
    onPendingChange?.(mutation.isPending || deleteMutation.isPending)
  }, [mutation.isPending, deleteMutation.isPending, onPendingChange])

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    try {
      const fields = parsePendienteFields({
        name,
        category,
        dueDate,
        expectedAmount,
        recurring,
      })
      setError(null)
      mutation.mutate(fields)
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : 'No se pudo agregar el pendiente'
      setError(message)
    }
  }

  const alertMessage =
    error ??
    (mutation.isError &&
    !(
      mutation.error instanceof PendienteNotFoundError ||
      mutation.error instanceof PendienteAlreadyPaidError
    )
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
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain">
        {/* The Sheet's own title is visually hidden (it exists only for the
            dialog's accessible name), which left this opening onto a bare
            "Nombre" field with nothing saying what screen it was. */}
        <h2 className="text-title font-semibold">
          {isEditing ? 'Editar pendiente' : 'Nuevo pendiente'}
        </h2>

        {/* Unlike an Expense's price, a Pendiente's amount is optional -- some
            bills (a variable grocery run) genuinely aren't known yet -- so it
            leads at the same hero size without being required, rather than
            forcing a number in before the bill is even known. */}
        <div className="flex w-full flex-col gap-2">
          <Label
            htmlFor="pendiente-expected-amount"
            className="text-muted-foreground font-medium"
          >
            Monto esperado
          </Label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="text-muted-foreground font-display text-display pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
            >
              $
            </span>
            <FormattedAmountInput
              id="pendiente-expected-amount"
              name="pendiente-expected-amount"
              className="font-display text-display h-20 pl-12 tracking-tight"
              value={expectedAmount}
              onChange={setExpectedAmount}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex w-full flex-col gap-2">
          <Label
            htmlFor="pendiente-name"
            className="text-muted-foreground font-medium"
          >
            Nombre
          </Label>
          <Input
            id="pendiente-name"
            name="pendiente-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
            }}
            autoComplete="off"
          />
        </div>

        <div className="flex w-full flex-col gap-2">
          <Label
            htmlFor="pendiente-category"
            className="text-muted-foreground font-medium"
          >
            Categoría
          </Label>
          <CategoryChips
            categories={categories}
            value={category}
            onChange={setCategory}
          />
          <CategoryCombobox
            id="pendiente-category"
            categories={categories}
            value={category}
            onChange={setCategory}
            placeholder="O escribí una categoría nueva"
          />
        </div>

        <div className="flex w-full flex-col gap-2">
          <Label
            htmlFor="pendiente-due-date"
            className="text-muted-foreground font-medium"
          >
            Fecha de vencimiento
          </Label>
          {/* Deliberately no `max`/`min` here, unlike the expense form's date
              input -- a Pendiente's due date is explicitly allowed to be in the
              past (e.g. logging an overdue bill) or the future. */}
          <Input
            id="pendiente-due-date"
            name="pendiente-due-date"
            type="date"
            value={dueDate}
            onChange={(event) => {
              setDueDate(event.target.value)
            }}
          />
        </div>

        <div className="flex w-full items-center justify-between gap-2">
          <Label htmlFor="pendiente-recurring" className="font-medium">
            Recurrente
          </Label>
          <Switch
            id="pendiente-recurring"
            checked={recurring}
            onCheckedChange={setRecurring}
          />
        </div>

        {alertMessage !== null ? (
          <AlertMessage>{alertMessage}</AlertMessage>
        ) : null}
      </div>

      <div className="shrink-0 pt-6">
        {confirmingDelete ? (
          <div
            role="alertdialog"
            aria-labelledby="delete-pendiente-title"
            className="bg-card shadow-raised flex w-full flex-col gap-4 rounded-2xl border border-border p-4"
          >
            <p id="delete-pendiente-title" className="text-sm font-medium">
              ¿Eliminar el pendiente?
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
                Eliminar pendiente
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
              {isEditing ? 'Guardar cambios' : 'Agregar pendiente'}
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
                  Eliminar pendiente
                </Button>
              </>
            ) : null}
          </div>
        )}
      </div>
    </form>
  )
}

export function AddPendienteForm({
  db,
  householdId,
  editPendiente = null,
  onEditFinished,
  onAdded,
  onPendingChange,
}: AddPendienteFormProps): ReactElement {
  const categoriesQuery = useQuery({
    queryKey: categoriesQueryKey({ householdId }),
    queryFn: () => listCategories({ db, householdId }),
  })
  const initialFields =
    editPendiente === null
      ? emptyFormFields()
      : formFieldsFromEdit(editPendiente)
  const formKey = editPendiente?.pendienteId ?? 'add'

  return (
    <PendienteFormBody
      key={formKey}
      db={db}
      householdId={householdId}
      editPendiente={editPendiente}
      initialFields={initialFields}
      categories={categoriesQuery.data ?? []}
      loadError={loadErrorMessage(categoriesQuery.error)}
      onEditFinished={onEditFinished}
      onAdded={onAdded}
      onPendingChange={onPendingChange}
    />
  )
}
