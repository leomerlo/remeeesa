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
  expensesQueryKey,
} from '@/features/expenses'
import {
  createPendiente,
  markPendientePaid,
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
  parseExpenseDate,
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
  // Pre-checks "Ya lo pagué" -- set by entry points whose whole purpose is
  // paying (Home's "Cuentas por pagar" cards, PendientesList's "Pagar"
  // button), so the toggle already reflects that intent rather than making
  // the user find and flip it themselves.
  readonly defaultMarkPaid?: boolean
}

export type AddPendienteFormProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // Only required to mark a Pendiente paid (the resulting Expense is
  // attributed to this member) -- unused while adding or editing without
  // checking "Ya lo pagué".
  readonly memberId: string
  readonly authorDisplayName: string
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

// Separate from parseDateInput above -- same malformed-string shape, but a
// payment date needs "de pago" wording (and a past-or-today check a due
// date deliberately skips; see the Fecha de vencimiento field below).
function parsePaymentDateInput(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) {
    throw new Error('La fecha de pago no es válida')
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
    throw new Error('La fecha de pago no es válida')
  }
  try {
    return parseExpenseDate(date)
  } catch {
    throw new Error('La fecha de pago no puede ser futura')
  }
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

type SaveVariables = {
  readonly fields: ParsedPendienteFields
  readonly markPaid: boolean
  readonly paymentDate: Date | null
}

// A plain edit (not marking paid) never surfaces PendienteNotFoundError/
// PendienteAlreadyPaidError here -- both close the sheet from the
// mutation's own onError instead of rendering an alert, since there's
// nothing left to save over. Marking paid is different: the user came here
// specifically to pay something, so if it turns out to already be gone or
// paid (e.g. by another household member a moment earlier), the sheet
// stays open with this message instead of silently disappearing -- these
// two error classes carry no message of their own (see pendientes.ts), so
// they need one here.
function mutationErrorMessage(error: unknown, mode: 'add' | 'edit'): string {
  if (error instanceof PendienteAlreadyPaidError) {
    return 'Este pendiente ya fue pagado'
  }
  if (error instanceof PendienteNotFoundError) {
    return 'Este pendiente ya no existe'
  }
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
  readonly memberId: string
  readonly authorDisplayName: string
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
  memberId,
  authorDisplayName,
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
  const expensesKey = expensesQueryKey({ householdId })
  const [name, setName] = useState(initialFields.name)
  const [category, setCategory] = useState(initialFields.category)
  const [dueDate, setDueDate] = useState(initialFields.dueDate)
  const [expectedAmount, setExpectedAmount] = useState(
    initialFields.expectedAmount,
  )
  const [recurring, setRecurring] = useState(initialFields.recurring)
  const [markPaid, setMarkPaid] = useState(
    editPendiente?.defaultMarkPaid ?? false,
  )
  const [paymentDate, setPaymentDate] = useState(
    localDateInputValue(new Date()),
  )
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const today = localDateInputValue(new Date())

  async function invalidatePendienteViews(): Promise<void> {
    // Categories are a separate entity from pendientes, so they keep their own
    // exact-key invalidation, same convention as the expense form.
    await queryClient.invalidateQueries({ queryKey: categoriesKey })
    await queryClient.invalidateQueries({ queryKey: pendientesKey })
  }

  const mutation = useMutation({
    mutationFn: async ({
      fields,
      markPaid: shouldMarkPaid,
      paymentDate: parsedPaymentDate,
    }: SaveVariables) => {
      const resolvedCategory = await findOrCreateCategory({
        db,
        householdId,
        name: fields.categoryName,
      })
      if (editPendiente !== null) {
        await updatePendiente({
          db,
          householdId,
          pendienteId: editPendiente.pendienteId,
          categoryId: resolvedCategory.id,
          name: fields.name,
          dueDate: fields.dueDate,
          expectedAmount: fields.expectedAmount,
          recurring: fields.recurring,
        })
        if (shouldMarkPaid) {
          // fields.expectedAmount === null is caught before mutate() is
          // called (see onSubmit) -- parsedPaymentDate is likewise never
          // null here, both guarded by the same `markPaid` flag.
          await markPendientePaid({
            db,
            householdId,
            pendienteId: editPendiente.pendienteId,
            memberId,
            authorDisplayName,
            finalAmount: fields.expectedAmount ?? 0,
            paymentDate: parsedPaymentDate ?? new Date(),
          })
        }
        return
      }
      const created = await createPendiente({
        db,
        householdId,
        categoryId: resolvedCategory.id,
        name: fields.name,
        dueDate: fields.dueDate,
        expectedAmount: fields.expectedAmount,
        recurring: fields.recurring,
      })
      if (shouldMarkPaid) {
        // Same "fields.expectedAmount === null is caught before mutate()"
        // guard as the editing branch above -- markPaid can't reach here
        // with a null amount or a null paymentDate.
        await markPendientePaid({
          db,
          householdId,
          pendienteId: created.id,
          memberId,
          authorDisplayName,
          finalAmount: fields.expectedAmount ?? 0,
          paymentDate: parsedPaymentDate ?? new Date(),
        })
      }
    },
    onSuccess: async (_result, variables) => {
      if (isEditing) {
        onEditFinished?.()
      } else {
        const reset = emptyFormFields()
        setName(reset.name)
        setCategory(reset.category)
        setDueDate(reset.dueDate)
        setExpectedAmount(reset.expectedAmount)
        setRecurring(reset.recurring)
        // Reset alongside every other field: AddPendienteSheet closes on a
        // successful add today, which would remount this fresh anyway, but
        // nothing about this component depends on that -- a host that keeps
        // it mounted across an add (the way editing already does across
        // saves) shouldn't carry a checked "Ya lo pagué" into the next one.
        setMarkPaid(false)
        setPaymentDate(localDateInputValue(new Date()))
        onAdded?.()
      }
      setError(null)
      await invalidatePendienteViews()
      if (variables.markPaid) {
        // A new Expense was created by markPendientePaid -- every view
        // reading expensesQueryKey (Home, Histórico) needs to see it too.
        await queryClient.invalidateQueries({ queryKey: expensesKey })
      }
    },
    // A stale Pendiente (deleted, or marked paid, by someone else while this
    // form was open) can't usefully stay open for a retry -- there's
    // nothing left to save over. Invalidate so the pending list reflects
    // reality and close the sheet, the same "can't act on it, so don't
    // block on it" outcome as the delete-on-a-gone-Pendiente case below.
    onError: async (caught, variables) => {
      if (
        caught instanceof PendienteNotFoundError ||
        caught instanceof PendienteAlreadyPaidError
      ) {
        await invalidatePendienteViews()
        // A plain edit has nothing left to save over -- close and refresh.
        // A mark-paid attempt stays open instead: the user came here to pay
        // something, so silently disappearing would hide exactly the
        // information ("already paid") they need to see.
        if (!variables.markPaid) {
          onEditFinished?.()
        }
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
      if (markPaid && fields.expectedAmount === null) {
        throw new Error('Ingresá un monto para marcarlo como pagado')
      }
      const parsedPaymentDate = markPaid
        ? parsePaymentDateInput(paymentDate)
        : null
      setError(null)
      mutation.mutate({ fields, markPaid, paymentDate: parsedPaymentDate })
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : 'No se pudo agregar el pendiente'
      setError(message)
    }
  }

  // Mirrors the onError guard above: a plain edit's stale-pendiente error
  // closes the sheet instead of rendering here, but a failed mark-paid
  // attempt stays open and needs its own alert.
  const isStaleError =
    mutation.error instanceof PendienteNotFoundError ||
    mutation.error instanceof PendienteAlreadyPaidError
  const wasMarkPaidAttempt = mutation.variables?.markPaid ?? false
  const suppressStaleError = isStaleError && !wasMarkPaidAttempt

  const alertMessage =
    error ??
    (mutation.isError && !suppressStaleError
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
        {/* The Sheet's own title is visually hidden (it exists only for the
            dialog's accessible name), which left this opening onto a bare
            "Nombre" field with nothing saying what screen it was. */}
        <h2 className="text-title font-semibold">
          {isEditing ? 'Editar pendiente' : 'Nuevo recurrente'}
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

        {/* Available while adding too, not just editing: a pendiente can be
            logged already paid in one step (e.g. a bill paid on the spot),
            same as editing an existing one to pay it. Replaces the old
            separate "Marcar pagado" sheet: one form for adding, editing,
            and paying, per direct feedback. */}
        <div className="flex w-full flex-col gap-2">
          <div className="flex w-full items-center justify-between gap-2">
            <Label htmlFor="pendiente-mark-paid" className="font-medium">
              Ya lo pagué
            </Label>
            <Switch
              id="pendiente-mark-paid"
              checked={markPaid}
              onCheckedChange={setMarkPaid}
            />
          </div>
          {markPaid ? (
            <div className="flex w-full flex-col gap-2">
              <Label
                htmlFor="pendiente-payment-date"
                className="text-muted-foreground font-medium"
              >
                Fecha de pago
              </Label>
              <Input
                id="pendiente-payment-date"
                name="pendiente-payment-date"
                type="date"
                value={paymentDate}
                max={today}
                onChange={(event) => {
                  setPaymentDate(event.target.value)
                }}
              />
            </div>
          ) : null}
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
              {isEditing
                ? markPaid
                  ? 'Guardar y marcar pagado'
                  : 'Guardar cambios'
                : markPaid
                  ? 'Agregar y marcar pagado'
                  : 'Agregar recurrente'}
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
  memberId,
  authorDisplayName,
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
      memberId={memberId}
      authorDisplayName={authorDisplayName}
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
