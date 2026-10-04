import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertMessage } from '@/components/ui/alert-message'
import { useEffect, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { currenciesOf, DEFAULT_CURRENCY } from '@/lib/money'
import type { Currency } from '@/lib/money'
import { CategoryCombobox } from './CategoryCombobox'
import {
  createExpense,
  findOrCreateCategory,
  listCategories,
  parseCategoryName,
  parseExpenseDate,
  parseExpenseName,
} from '@/lib/expenses'
import {
  createPendiente,
  markPendientePaid,
  parseExpectedAmount,
  parsePendienteDueDate,
  parsePendienteName,
} from '@/lib/pendientes'
import type { HouseholdsDb } from '@/lib/households'
import {
  createCardPurchase,
  deleteCardPurchase,
  listCards,
  MAX_CUOTAS,
  PAYMENT_METHOD_KINDS,
  parseCuotas,
  updateCardPurchase,
} from '@/lib/cards'
import type { CardPurchase } from '@/lib/cards'
import { cardsQueryKey } from '@/features/household/cardsQueryKey'
import { categoriesQueryKey, expensesQueryKey } from './queryKeys'
// Imported from the leaf file, not the @/features/pendientes barrel --
// that barrel re-exports AddPendienteForm, which imports from this very
// feature (CategoryCombobox), and going through it here would create a
// features/expenses <-> features/pendientes import cycle.
import { pendientesQueryKey } from '@/features/pendientes/queryKeys'

// A card purchase opened from the movements list to edit or delete.
export type EditPurchaseTarget = {
  readonly purchase: CardPurchase
  readonly categoryName: string
}

export type AddGastoFormProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly onAdded?: () => void
  readonly onPendingChange?: (pending: boolean) => void
  // Home logs anything: a bill for later, a recurring service, a spend that
  // already happened -- so it gets all three toggles. Histórico is the list
  // of gastos, and a gasto added from there is by definition something
  // already spent, so it gets "Ya lo pagué" alone. Per direct feedback.
  readonly showRecurringOptions?: boolean
  // Set while Home is showing a future month: the form opens as a bill due
  // then ("Ya lo pagué" off, date on this day) rather than as a gasto paid
  // today, since planning that month is why the person is looking at it.
  readonly defaultDueDate?: Date
  readonly editPurchase?: EditPurchaseTarget | null
  // Called once an edit is saved, deleted, or cancelled.
  readonly onEditFinished?: () => void
}

type GastoFormFields = {
  readonly name: string
  readonly category: string
  readonly date: string
  readonly amount: string
  readonly recurring: boolean
  readonly autoDebit: boolean
}

function localDateInputValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function emptyFormFields(defaultDueDate?: Date): GastoFormFields {
  return {
    name: '',
    category: '',
    date: localDateInputValue(defaultDueDate ?? new Date()),
    amount: '',
    recurring: false,
    autoDebit: false,
  }
}

function editFormFields(target: EditPurchaseTarget): GastoFormFields {
  return {
    name: target.purchase.name,
    category: target.categoryName,
    date: localDateInputValue(target.purchase.purchaseDate),
    amount: String(target.purchase.total),
    recurring: false,
    autoDebit: false,
  }
}

function parseDateInput(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) {
    throw new Error('La fecha no es válida')
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
    throw new Error('La fecha no es válida')
  }
  return date
}

type ParsedGastoFields = {
  readonly name: string
  readonly categoryName: string
  readonly date: Date
  readonly amount: number | null
  readonly recurring: boolean
  readonly autoDebit: boolean
}

// The one date field doubles as "cuándo lo gastaste" (markPaid) or "cuándo
// vence" (not yet paid) depending on the toggle -- see the Fecha field's
// dynamic label below. Whichever it means, the parsing rule follows: paid
// can't be dated in the future, due can be either.
function parseGastoFields(
  input: GastoFormFields,
  markPaid: boolean,
): ParsedGastoFields {
  const trimmedAmount = input.amount.trim()
  const rawDate = parseDateInput(input.date)
  // Whichever entity this ends up creating (see isPlainGasto in the
  // component below) uses its own name validator for an accurate message.
  const isPlainGasto = !input.recurring && markPaid
  return {
    name: isPlainGasto
      ? parseExpenseName(input.name)
      : parsePendienteName(input.name),
    categoryName: parseCategoryName(input.category),
    date: markPaid ? parseExpenseDate(rawDate) : parsePendienteDueDate(rawDate),
    // Blank must reach parseExpectedAmount as `null`, not `0` -- Number('')
    // is 0, which it would reject as non-positive.
    amount: parseExpectedAmount(
      trimmedAmount === '' ? null : Number(trimmedAmount),
    ),
    recurring: input.recurring,
    // Only a recurring bill can be on débito automático -- the toggle is
    // disabled otherwise, and cleared when Recurrente is switched off, so
    // this can never reach the DB as `true` on a one-off.
    autoDebit: input.recurring && input.autoDebit,
  }
}

function mutationErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return 'No se pudo agregar el gasto'
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

// The unified entry point for logging money owed or spent: one button
// ("Agregar gasto"), one form, with "Recurrente" and "Ya lo pagué" deciding
// what actually gets created underneath -- replaces the old side-by-side
// "Agregar gasto" / "Agregar Servicio" buttons, which forced that choice
// *before* the user even knew which one they had. Per direct feedback: a
// plain gasto (not recurring, already paid) is really just a Pendiente
// created and marked paid in the same instant, so this form always decides
// at submit time which of the two it actually is.
//
// Editing an Expense or a Pendiente is out of scope here -- those stay two
// different edit flows (AddExpenseForm / AddPendienteForm), reached from
// their own rows, since converting one into the other mid-edit has no clean
// mapping. A card purchase is the exception (editPurchase): this is the only
// form it has, so it edits here, staying a card purchase.
export function AddGastoForm({
  db,
  householdId,
  memberId,
  authorDisplayName,
  onAdded,
  onPendingChange,
  showRecurringOptions = true,
  defaultDueDate,
  editPurchase = null,
  onEditFinished,
}: AddGastoFormProps): ReactElement {
  const queryClient = useQueryClient()
  const categoriesKey = categoriesQueryKey({ householdId })
  const pendientesKey = pendientesQueryKey({ householdId })
  const expensesKey = expensesQueryKey({ householdId })
  const categoriesQuery = useQuery({
    queryKey: categoriesKey,
    queryFn: () => listCategories({ db, householdId }),
  })

  const isEditing = editPurchase !== null
  const initialFields =
    editPurchase === null
      ? emptyFormFields(defaultDueDate)
      : editFormFields(editPurchase)
  const [name, setName] = useState(initialFields.name)
  const [category, setCategory] = useState(initialFields.category)
  const [date, setDate] = useState(initialFields.date)
  const [amount, setAmount] = useState(initialFields.amount)
  // Pesos by default: a dollar gasto is the exception, and the budget only
  // ever counts pesos -- see lib/money/currency. Editing a card purchase
  // starts at the currency it was saved in instead.
  const [currency, setCurrency] = useState<Currency>(
    editPurchase?.purchase.currency ?? DEFAULT_CURRENCY,
  )
  const [recurring, setRecurring] = useState(initialFields.recurring)
  const [autoDebit, setAutoDebit] = useState(initialFields.autoDebit)
  // Checked by default: adding a gasto usually means logging something that
  // already happened, not setting up a future bill -- per direct feedback.
  const [markPaid, setMarkPaid] = useState(defaultDueDate === undefined)
  // '' is "Efectivo / débito": today's behaviour. A card id turns this into
  // a card purchase, which counts in its Resúmenes, not in this month.
  const [cardId, setCardId] = useState(editPurchase?.purchase.cardId ?? '')
  const [cuotas, setCuotas] = useState(
    String(editPurchase?.purchase.cuotas ?? 1),
  )
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const today = localDateInputValue(new Date())
  const cardsQuery = useQuery({
    queryKey: cardsQueryKey({ householdId }),
    queryFn: () => listCards({ db, householdId }),
  })
  const cards = cardsQuery.data ?? []
  // The method picked, or undefined for cash -- the one every household has
  // without writing it down, which is why it is the empty value and the
  // default. Per direct feedback: efectivo siempre aparece.
  const method = cards.find((card) => card.id === cardId)
  // Only credit books a purchase whose cuotas land in a later Resumen.
  // Cash, a balance and debit are money that has already gone, so they make
  // an ordinary gasto of this month -- the method is recorded on it, but it
  // is the month's spending either way. Per direct feedback.
  const isCredito = method !== undefined && method.kind === 'credito'
  // The method decides the currency, which is the whole reason it is picked
  // before the amount: the field's prefix is whatever this method is in.
  // Only a credit card billed in both leaves it an actual choice.
  const offered = currenciesOf(method?.currency ?? DEFAULT_CURRENCY)
  const narrowedTo = offered.length === 1 ? offered[0] : undefined
  const effectiveCurrency: Currency = narrowedTo ?? currency
  const picksCurrency = narrowedTo === undefined

  async function invalidateGastoViews(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: categoriesKey })
    await queryClient.invalidateQueries({ queryKey: pendientesKey })
    await queryClient.invalidateQueries({ queryKey: expensesKey })
  }

  const mutation = useMutation({
    mutationFn: async (fields: ParsedGastoFields) => {
      const resolvedCategory = await findOrCreateCategory({
        db,
        householdId,
        name: fields.categoryName,
      })
      if (editPurchase !== null) {
        await updateCardPurchase({
          db,
          householdId,
          purchaseId: editPurchase.purchase.id,
          cardId,
          categoryId: resolvedCategory.id,
          name: fields.name,
          total: fields.amount ?? 0,
          cuotas: Number(cuotas),
          purchaseDate: fields.date,
          comments: editPurchase.purchase.comments,
          currency: effectiveCurrency,
        })
        return
      }
      if (isCredito) {
        await createCardPurchase({
          db,
          householdId,
          cardId,
          categoryId: resolvedCategory.id,
          memberId,
          authorDisplayName,
          name: fields.name,
          // Required for a card purchase -- checked in onSubmit.
          total: fields.amount ?? 0,
          cuotas: Number(cuotas),
          purchaseDate: fields.date,
          comments: '',
          currency: effectiveCurrency,
        })
        return
      }
      const isPlainGasto = !fields.recurring && markPaid
      if (isPlainGasto) {
        // fields.amount === null is caught before mutate() is called (see
        // onSubmit) whenever markPaid is true.
        await createExpense({
          db,
          householdId,
          categoryId: resolvedCategory.id,
          memberId,
          authorDisplayName,
          name: fields.name,
          price: fields.amount ?? 0,
          comments: '',
          expenseDate: fields.date,
          currency: effectiveCurrency,
          // Null for cash: the method every household has without adding
          // it, and the one this field has always meant by "nothing".
          paymentMethodId: cardId === '' ? null : cardId,
        })
        return
      }
      const created = await createPendiente({
        db,
        householdId,
        categoryId: resolvedCategory.id,
        name: fields.name,
        dueDate: fields.date,
        expectedAmount: fields.amount,
        recurring: fields.recurring,
        autoDebit: fields.autoDebit,
      })
      if (markPaid) {
        await markPendientePaid({
          db,
          householdId,
          pendienteId: created.id,
          memberId,
          authorDisplayName,
          finalAmount: fields.amount ?? 0,
          paymentDate: fields.date,
        })
      }
    },
    onSuccess: async () => {
      if (isEditing) {
        onEditFinished?.()
        await invalidateGastoViews()
        return
      }
      const reset = emptyFormFields(defaultDueDate)
      setName(reset.name)
      setCategory(reset.category)
      setDate(reset.date)
      setAmount(reset.amount)
      setCurrency(DEFAULT_CURRENCY)
      setRecurring(reset.recurring)
      setAutoDebit(reset.autoDebit)
      setMarkPaid(defaultDueDate === undefined)
      setCardId('')
      setCuotas('1')
      setError(null)
      onAdded?.()
      await invalidateGastoViews()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (editPurchase === null) {
        throw new Error('No hay una compra para eliminar')
      }
      await deleteCardPurchase({
        db,
        householdId,
        purchaseId: editPurchase.purchase.id,
      })
    },
    onSuccess: async () => {
      setConfirmingDelete(false)
      onEditFinished?.()
      await invalidateGastoViews()
    },
    onError: () => {
      setConfirmingDelete(false)
    },
  })

  const isPending = mutation.isPending || deleteMutation.isPending
  useEffect(() => {
    onPendingChange?.(isPending)
  }, [isPending, onPendingChange])

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    deleteMutation.reset()
    try {
      // A card purchase already happened: it parses like a paid, one-off
      // gasto, whatever the (hidden) toggles below say.
      const fields = parseGastoFields(
        {
          name,
          category,
          date,
          amount,
          recurring: !isCredito && recurring,
          autoDebit,
        },
        isCredito || markPaid,
      )
      if ((isCredito || markPaid) && fields.amount === null) {
        throw new Error('Ingresá un monto')
      }
      // Before mutate: a rejected purchase must not leave a new category.
      if (isCredito) {
        parseCuotas(Number(cuotas), fields.amount ?? 0)
      }
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
    (mutation.isError ? mutationErrorMessage(mutation.error) : null) ??
    (deleteMutation.isError
      ? mutationErrorMessage(deleteMutation.error)
      : null) ??
    loadErrorMessage(categoriesQuery.error) ??
    // Without this, a failed load would look like a household with no cards.
    (cardsQuery.isError ? 'No se pudieron cargar las tarjetas.' : null)

  // Switching Recurrente off takes Débito automático with it: a one-off is
  // never on automatic debit, and leaving it checked-but-ignored would come
  // back the moment Recurrente was switched on again.
  function onRecurringChange(next: boolean): void {
    setRecurring(next)
    if (!next) {
      setAutoDebit(false)
    }
  }

  // A paid gasto cannot be dated in the future, so checking "Ya lo pagué"
  // over a future due date pulls it back to today instead of leaving a date
  // the submit would reject. ISO dates compare correctly as strings.
  function onMarkPaidChange(next: boolean): void {
    setMarkPaid(next)
    if (next && date > today) {
      setDate(today)
    }
  }

  // Like "Ya lo pagué": a purchase cannot be dated in the future, so picking
  // a card over a future date pulls it back to today.
  function onCardChange(next: string): void {
    setCardId(next)
    if (next !== '' && date > today) {
      setDate(today)
    }
  }

  const isPlainGasto = isCredito || (!recurring && markPaid)
  const submitLabel = isEditing
    ? 'Guardar cambios'
    : isCredito
      ? 'Agregar compra'
      : markPaid
        ? recurring
          ? 'Agregar y marcar pagado'
          : 'Agregar gasto'
        : recurring
          ? 'Agregar servicio'
          : 'Agregar servicio'

  return (
    <form
      className="flex h-full min-h-0 w-full flex-col"
      noValidate
      onSubmit={onSubmit}
    >
      {/* Only this part scrolls -- the action button below stays pinned at
          the bottom of the sheet regardless of how tall the field list
          gets. */}
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto overscroll-contain">
        {/* The Sheet's own title is visually hidden (it exists only for the
            dialog's accessible name). */}
        <h2 className="text-title font-semibold">
          {isEditing ? 'Editar compra' : 'Agregar gasto'}
        </h2>

        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="gasto-name">Nombre</Label>
          <Input
            id="gasto-name"
            name="gasto-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
            }}
            autoComplete="off"
          />
        </div>

        {/* Before the amount, per direct feedback: the method decides what
            currency the amount is in, so the field's prefix is already
            right by the time you type into it. */}
        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="gasto-paid-with">Método de pago</Label>
          <Select
            id="gasto-paid-with"
            name="gasto-paid-with"
            value={cardId}
            onChange={(event) => {
              onCardChange(event.target.value)
            }}
          >
            {/* A purchase being edited stays a card purchase: turning it
                into a gasto is deleting it and adding one. */}
            {isEditing ? null : <option value="">Efectivo</option>}
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </Select>
          {/* What this method does with the money, said where it is
              picked: crédito is the one that does not touch this month. */}
          <p className="text-muted-foreground text-xs">
            {method === undefined
              ? 'Plata en mano, en pesos. Agregá otros en Ajustes.'
              : (PAYMENT_METHOD_KINDS.find(
                  (option) => option.value === method.kind,
                )?.detail ?? '')}
          </p>
          {cardsQuery.isSuccess && cards.length === 0 ? (
            <Link
              to="/household"
              className="text-primary self-start text-sm font-medium underline-offset-4 hover:underline"
            >
              Agregar un método de pago en Ajustes
            </Link>
          ) : null}
        </div>

        {/* Required once "Ya lo pagué" is checked (the common case, on by
            default); optional otherwise -- some bills genuinely aren't a
            known amount yet. At ordinary field size: it used to lead at hero
            size, which pushed the two toggles below the fold, and per direct
            feedback the toggles being reachable matters more than the
            figure being large in a form you are typing into. */}
        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="gasto-amount">
            {isPlainGasto ? 'Precio' : 'Monto esperado'}
          </Label>
          <div className="flex w-full items-center gap-2">
            {/* The currency sits with the amount because that is what it
                qualifies. Pesos is the default and the usual case. With a
                card chosen it stops being a choice: the card's own currency
                is shown instead. */}
            {picksCurrency ? (
              <Select
                aria-label="Moneda"
                value={effectiveCurrency}
                onChange={(event) => {
                  setCurrency(event.target.value === 'USD' ? 'USD' : 'ARS')
                }}
                className="w-auto shrink-0 text-sm"
              >
                {offered.map((option) => (
                  <option key={option} value={option}>
                    {option === 'USD' ? 'US$' : '$'}
                  </option>
                ))}
              </Select>
            ) : (
              <span
                aria-hidden="true"
                className="border-input bg-muted text-muted-foreground flex h-12 shrink-0 items-center rounded-lg border px-3 text-sm"
              >
                {effectiveCurrency === 'USD' ? 'US$' : '$'}
              </span>
            )}
            <div className="relative min-w-0 flex-1">
              <FormattedAmountInput
                id="gasto-amount"
                name="gasto-amount"
                value={amount}
                onChange={setAmount}
                autoComplete="off"
              />
            </div>
          </div>
          {effectiveCurrency === 'USD' ? (
            <p className="text-muted-foreground text-xs">
              Los gastos en dólares se registran pero no se descuentan del
              presupuesto del mes.
            </p>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="gasto-category">Categoría</Label>
          <CategoryCombobox
            id="gasto-category"
            categories={categoriesQuery.data ?? []}
            value={category}
            onChange={setCategory}
            placeholder="Elegí o escribí una nueva"
          />
        </div>

        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="gasto-date">
            {isCredito || markPaid ? 'Fecha' : 'Fecha de vencimiento'}
          </Label>
          {/* Restricted to today or earlier only while markPaid is checked
              -- a due date (not yet paid) is explicitly allowed to be in the
              past (an overdue bill) or the future. */}
          <Input
            id="gasto-date"
            name="gasto-date"
            type="date"
            value={date}
            max={isCredito || markPaid ? today : undefined}
            onChange={(event) => {
              setDate(event.target.value)
            }}
          />
        </div>

        {isCredito ? (
          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="gasto-cuotas">Cuotas</Label>
            <Input
              id="gasto-cuotas"
              name="gasto-cuotas"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_CUOTAS}
              step={1}
              value={cuotas}
              onChange={(event) => {
                setCuotas(event.target.value)
              }}
            />
          </div>
        ) : null}

        {/* One toggle per line, switch then label -- the same shape the
            servicio form uses, so the two entry points to the same
            underlying record look alike. Side by side, "Débito automático"
            had nowhere to go but a second line at phone width, where it
            clipped. Débito automático means the household does not pay this
            one: the bank takes it on the due date. */}
        {/* A card purchase is neither a bill for later nor recurring: it
            already happened, and its Resúmenes are what gets paid. */}
        {isCredito ? null : (
          <div className="flex w-full flex-col gap-4">
            {showRecurringOptions ? (
              <>
                <div className="flex min-h-[46px] w-full items-center gap-3 lg:min-h-0">
                  <Switch
                    id="gasto-recurring"
                    checked={recurring}
                    onCheckedChange={onRecurringChange}
                  />
                  <Label htmlFor="gasto-recurring">Recurrente</Label>
                </div>
                <div className="flex min-h-[46px] w-full items-center gap-3 lg:min-h-0">
                  <Switch
                    id="gasto-auto-debit"
                    checked={autoDebit}
                    disabled={!recurring}
                    onCheckedChange={setAutoDebit}
                  />
                  <Label htmlFor="gasto-auto-debit">Débito automático</Label>
                </div>
              </>
            ) : null}

            <div className="flex min-h-[46px] w-full items-center gap-3 lg:min-h-0">
              <Switch
                id="gasto-mark-paid"
                checked={markPaid}
                onCheckedChange={onMarkPaidChange}
              />
              <Label htmlFor="gasto-mark-paid">Ya lo pagué</Label>
            </div>
          </div>
        )}

        {alertMessage !== null ? (
          <AlertMessage>{alertMessage}</AlertMessage>
        ) : null}
      </div>

      <div className="shrink-0 pt-6">
        {confirmingDelete ? (
          <div
            role="alertdialog"
            aria-labelledby="delete-purchase-title"
            className="bg-card flex w-full flex-col gap-4 rounded-2xl border border-border p-4"
          >
            <p id="delete-purchase-title" className="text-sm font-medium">
              ¿Eliminar la compra? Sus cuotas salen de los resúmenes.
            </p>
            <div className="flex w-full gap-2">
              <Button
                type="button"
                variant="destructive-outline"
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
                variant="destructive"
                className="flex-1"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  deleteMutation.mutate()
                }}
              >
                Eliminar compra
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center gap-2">
            <Button type="submit" disabled={isPending} className="w-full">
              {submitLabel}
            </Button>
            {isEditing ? (
              <Button
                type="button"
                variant="destructive-outline"
                className="w-full"
                disabled={isPending}
                onClick={() => {
                  setError(null)
                  mutation.reset()
                  setConfirmingDelete(true)
                }}
              >
                Eliminar compra
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </form>
  )
}
