import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertMessage } from '@/components/ui/alert-message'
import { useEffect, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { createCardPurchase, listCards, MAX_CUOTAS } from '@/lib/cards'
import { cardsQueryKey } from '@/features/household/cardsQueryKey'
import { categoriesQueryKey, expensesQueryKey } from './queryKeys'
// Imported from the leaf file, not the @/features/pendientes barrel --
// that barrel re-exports AddPendienteForm, which imports from this very
// feature (CategoryCombobox), and going through it here would create a
// features/expenses <-> features/pendientes import cycle.
import { pendientesQueryKey } from '@/features/pendientes/queryKeys'

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
// Editing is deliberately out of scope here -- an existing Expense and an
// existing Pendiente stay two different edit flows (AddExpenseForm /
// AddPendienteForm), reached from their own rows, since converting one into
// the other mid-edit has no clean mapping (a Pendiente's dueDate/recurring
// have no Expense equivalent, and vice versa).
export function AddGastoForm({
  db,
  householdId,
  memberId,
  authorDisplayName,
  onAdded,
  onPendingChange,
  showRecurringOptions = true,
  defaultDueDate,
}: AddGastoFormProps): ReactElement {
  const queryClient = useQueryClient()
  const categoriesKey = categoriesQueryKey({ householdId })
  const pendientesKey = pendientesQueryKey({ householdId })
  const expensesKey = expensesQueryKey({ householdId })
  const categoriesQuery = useQuery({
    queryKey: categoriesKey,
    queryFn: () => listCategories({ db, householdId }),
  })

  const initialFields = emptyFormFields(defaultDueDate)
  const [name, setName] = useState(initialFields.name)
  const [category, setCategory] = useState(initialFields.category)
  const [date, setDate] = useState(initialFields.date)
  const [amount, setAmount] = useState(initialFields.amount)
  const [recurring, setRecurring] = useState(initialFields.recurring)
  const [autoDebit, setAutoDebit] = useState(initialFields.autoDebit)
  // Checked by default: adding a gasto usually means logging something that
  // already happened, not setting up a future bill -- per direct feedback.
  const [markPaid, setMarkPaid] = useState(defaultDueDate === undefined)
  // '' is "Efectivo / débito": today's behaviour. A card id turns this into
  // a card purchase, which counts in its Resúmenes, not in this month.
  const [cardId, setCardId] = useState('')
  const [cuotas, setCuotas] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const today = localDateInputValue(new Date())
  const cardsQuery = useQuery({
    queryKey: cardsQueryKey({ householdId }),
    queryFn: () => listCards({ db, householdId }),
  })
  const cards = cardsQuery.data ?? []
  const isCard = cardId !== ''

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
      if (cardId !== '') {
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
      const reset = emptyFormFields(defaultDueDate)
      setName(reset.name)
      setCategory(reset.category)
      setDate(reset.date)
      setAmount(reset.amount)
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

  useEffect(() => {
    onPendingChange?.(mutation.isPending)
  }, [mutation.isPending, onPendingChange])

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    try {
      // A card purchase already happened: it parses like a paid, one-off
      // gasto, whatever the (hidden) toggles below say.
      const fields = parseGastoFields(
        {
          name,
          category,
          date,
          amount,
          recurring: !isCard && recurring,
          autoDebit,
        },
        isCard || markPaid,
      )
      if ((isCard || markPaid) && fields.amount === null) {
        throw new Error('Ingresá un monto')
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
    loadErrorMessage(categoriesQuery.error)

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

  const isPlainGasto = isCard || (!recurring && markPaid)
  const submitLabel = isCard
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
        <h2 className="text-title font-semibold">Agregar gasto</h2>

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
          <div className="relative">
            <span
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
            >
              $
            </span>
            <FormattedAmountInput
              id="gasto-amount"
              name="gasto-amount"
              className="pl-8"
              value={amount}
              onChange={setAmount}
              autoComplete="off"
            />
          </div>
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
            {isCard || markPaid ? 'Fecha' : 'Fecha de vencimiento'}
          </Label>
          {/* Restricted to today or earlier only while markPaid is checked
              -- a due date (not yet paid) is explicitly allowed to be in the
              past (an overdue bill) or the future. */}
          <Input
            id="gasto-date"
            name="gasto-date"
            type="date"
            value={date}
            max={isCard || markPaid ? today : undefined}
            onChange={(event) => {
              setDate(event.target.value)
            }}
          />
        </div>

        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="gasto-paid-with">Pagó con</Label>
          <select
            id="gasto-paid-with"
            name="gasto-paid-with"
            value={cardId}
            onChange={(event) => {
              onCardChange(event.target.value)
            }}
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-12 w-full min-w-0 rounded-lg border bg-transparent px-4 text-base outline-none focus-visible:ring-3 md:text-sm"
          >
            <option value="">Efectivo / débito</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
          {cardsQuery.isSuccess && cards.length === 0 ? (
            <Link
              to="/household"
              className="text-primary self-start text-sm font-medium underline-offset-4 hover:underline"
            >
              Crear una tarjeta en Ajustes
            </Link>
          ) : null}
        </div>

        {isCard ? (
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
        {isCard ? null : (
          <div className="flex w-full flex-col gap-4">
            {showRecurringOptions ? (
              <>
                <div className="flex w-full items-center gap-3">
                  <Switch
                    id="gasto-recurring"
                    checked={recurring}
                    onCheckedChange={onRecurringChange}
                  />
                  <Label htmlFor="gasto-recurring">Recurrente</Label>
                </div>
                <div className="flex w-full items-center gap-3">
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

            <div className="flex w-full items-center gap-3">
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
        <Button type="submit" disabled={mutation.isPending} className="w-full">
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
