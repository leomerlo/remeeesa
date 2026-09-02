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
import { categoriesQueryKey, expensesQueryKey } from './queryKeys'
// Imported from the leaf file, not the @/features/pendientes barrel --
// that barrel re-exports AddPendienteForm, which imports from this very
// feature (CategoryChips/CategoryCombobox), and going through it here would
// create a features/expenses <-> features/pendientes import cycle.
import { pendientesQueryKey } from '@/features/pendientes/queryKeys'

export type AddGastoFormProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly onAdded?: () => void
  readonly onPendingChange?: (pending: boolean) => void
}

type GastoFormFields = {
  readonly name: string
  readonly category: string
  readonly date: string
  readonly amount: string
  readonly recurring: boolean
}

function localDateInputValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function emptyFormFields(): GastoFormFields {
  return {
    name: '',
    category: '',
    date: localDateInputValue(new Date()),
    amount: '',
    recurring: false,
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
// "Agregar gasto" / "Nuevo recurrente" buttons, which forced that choice
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
}: AddGastoFormProps): ReactElement {
  const queryClient = useQueryClient()
  const categoriesKey = categoriesQueryKey({ householdId })
  const pendientesKey = pendientesQueryKey({ householdId })
  const expensesKey = expensesQueryKey({ householdId })
  const categoriesQuery = useQuery({
    queryKey: categoriesKey,
    queryFn: () => listCategories({ db, householdId }),
  })

  const initialFields = emptyFormFields()
  const [name, setName] = useState(initialFields.name)
  const [category, setCategory] = useState(initialFields.category)
  const [date, setDate] = useState(initialFields.date)
  const [amount, setAmount] = useState(initialFields.amount)
  const [recurring, setRecurring] = useState(initialFields.recurring)
  // Checked by default: adding a gasto usually means logging something that
  // already happened, not setting up a future bill -- per direct feedback.
  const [markPaid, setMarkPaid] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const today = localDateInputValue(new Date())

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
      const reset = emptyFormFields()
      setName(reset.name)
      setCategory(reset.category)
      setDate(reset.date)
      setAmount(reset.amount)
      setRecurring(reset.recurring)
      setMarkPaid(true)
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
      const fields = parseGastoFields(
        { name, category, date, amount, recurring },
        markPaid,
      )
      if (markPaid && fields.amount === null) {
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

  const isPlainGasto = !recurring && markPaid
  const submitLabel = markPaid
    ? recurring
      ? 'Agregar y marcar pagado'
      : 'Agregar gasto'
    : recurring
      ? 'Agregar recurrente'
      : 'Agregar pendiente'

  return (
    <form
      className="flex h-full min-h-0 w-full flex-col"
      noValidate
      onSubmit={onSubmit}
    >
      {/* Only this part scrolls -- the action button below stays pinned at
          the bottom of the sheet regardless of how tall the field list
          gets. */}
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain">
        {/* The Sheet's own title is visually hidden (it exists only for the
            dialog's accessible name). */}
        <h2 className="text-title font-semibold">Agregar gasto</h2>

        {/* Required once "Ya lo pagué" is checked (the common case, on by
            default); optional otherwise -- some bills genuinely aren't a
            known amount yet. Leads at hero size either way. */}
        <div className="flex w-full flex-col gap-2">
          <Label
            htmlFor="gasto-amount"
            className="text-muted-foreground font-medium"
          >
            {isPlainGasto ? 'Precio' : 'Monto esperado'}
          </Label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="text-muted-foreground font-display text-display pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
            >
              $
            </span>
            <FormattedAmountInput
              id="gasto-amount"
              name="gasto-amount"
              className="font-display text-display h-20 pl-12 tracking-tight"
              value={amount}
              onChange={setAmount}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex w-full flex-col gap-2">
          <Label
            htmlFor="gasto-name"
            className="text-muted-foreground font-medium"
          >
            Nombre
          </Label>
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

        <div className="flex w-full flex-col gap-2">
          <Label
            htmlFor="gasto-category"
            className="text-muted-foreground font-medium"
          >
            Categoría
          </Label>
          <CategoryChips
            categories={categoriesQuery.data ?? []}
            value={category}
            onChange={setCategory}
          />
          <CategoryCombobox
            id="gasto-category"
            categories={categoriesQuery.data ?? []}
            value={category}
            onChange={setCategory}
            placeholder="O escribí una categoría nueva"
          />
        </div>

        <div className="flex w-full flex-col gap-2">
          <Label
            htmlFor="gasto-date"
            className="text-muted-foreground font-medium"
          >
            {markPaid ? 'Fecha' : 'Fecha de vencimiento'}
          </Label>
          {/* Restricted to today or earlier only while markPaid is checked
              -- a due date (not yet paid) is explicitly allowed to be in the
              past (an overdue bill) or the future. */}
          <Input
            id="gasto-date"
            name="gasto-date"
            type="date"
            value={date}
            max={markPaid ? today : undefined}
            onChange={(event) => {
              setDate(event.target.value)
            }}
          />
        </div>

        <div className="flex w-full items-center justify-between gap-2">
          <Label htmlFor="gasto-recurring" className="font-medium">
            Recurrente
          </Label>
          <Switch
            id="gasto-recurring"
            checked={recurring}
            onCheckedChange={setRecurring}
          />
        </div>

        <div className="flex w-full items-center justify-between gap-2">
          <Label htmlFor="gasto-mark-paid" className="font-medium">
            Ya lo pagué
          </Label>
          <Switch
            id="gasto-mark-paid"
            checked={markPaid}
            onCheckedChange={setMarkPaid}
          />
        </div>

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
