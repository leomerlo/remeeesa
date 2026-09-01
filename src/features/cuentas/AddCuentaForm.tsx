import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { categoriesQueryKey, CategoryCombobox } from '@/features/expenses'
import {
  createCuenta,
  parseCuentaDueDate,
  parseCuentaName,
  parseExpectedAmount,
} from '@/lib/cuentas'
import {
  findOrCreateCategory,
  listCategories,
  parseCategoryName,
} from '@/lib/expenses'
import type { Category } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { cuentasQueryKey } from './queryKeys'

export type AddCuentaFormProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly onAdded?: () => void
  readonly onPendingChange?: (pending: boolean) => void
}

type CuentaFormFields = {
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

function emptyFormFields(): CuentaFormFields {
  return {
    name: '',
    category: '',
    dueDate: localDateInputValue(new Date()),
    expectedAmount: '',
    recurring: false,
  }
}

function parseDateInput(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) {
    throw new Error('La fecha de la cuenta no es válida')
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
    throw new Error('La fecha de la cuenta no es válida')
  }
  return date
}

type ParsedCuentaFields = {
  readonly name: string
  readonly categoryName: string
  readonly dueDate: Date
  readonly expectedAmount: number | null
  readonly recurring: boolean
}

function parseCuentaFields(input: CuentaFormFields): ParsedCuentaFields {
  const trimmedAmount = input.expectedAmount.trim()
  return {
    name: parseCuentaName(input.name),
    categoryName: parseCategoryName(input.category),
    dueDate: parseCuentaDueDate(parseDateInput(input.dueDate)),
    // Blank must reach createCuenta as `null`, not `0` -- Number('') is 0,
    // which parseExpectedAmount would reject as non-positive.
    expectedAmount: parseExpectedAmount(
      trimmedAmount === '' ? null : Number(trimmedAmount),
    ),
    recurring: input.recurring,
  }
}

function mutationErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return 'No se pudo agregar la cuenta'
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

type CuentaFormBodyProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categories: readonly Category[]
  readonly loadError: string | null
  readonly onAdded?: () => void
  readonly onPendingChange?: (pending: boolean) => void
}

function CuentaFormBody({
  db,
  householdId,
  categories,
  loadError,
  onAdded,
  onPendingChange,
}: CuentaFormBodyProps): ReactElement {
  const queryClient = useQueryClient()
  const cuentasKey = cuentasQueryKey({ householdId })
  const categoriesKey = categoriesQueryKey({ householdId })
  const initialFields = emptyFormFields()
  const [name, setName] = useState(initialFields.name)
  const [category, setCategory] = useState(initialFields.category)
  const [dueDate, setDueDate] = useState(initialFields.dueDate)
  const [expectedAmount, setExpectedAmount] = useState(
    initialFields.expectedAmount,
  )
  const [recurring, setRecurring] = useState(initialFields.recurring)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (fields: ParsedCuentaFields) => {
      const resolvedCategory = await findOrCreateCategory({
        db,
        householdId,
        name: fields.categoryName,
      })
      return createCuenta({
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
      const reset = emptyFormFields()
      setName(reset.name)
      setCategory(reset.category)
      setDueDate(reset.dueDate)
      setExpectedAmount(reset.expectedAmount)
      setRecurring(reset.recurring)
      setError(null)
      onAdded?.()
      await queryClient.invalidateQueries({ queryKey: categoriesKey })
      await queryClient.invalidateQueries({ queryKey: cuentasKey })
    },
  })

  // Lets a container (e.g. AddCuentaSheet) keep the form mounted while a
  // submit is in flight, so a dismiss can't abandon a pending mutation and
  // silently swallow its result.
  useEffect(() => {
    onPendingChange?.(mutation.isPending)
  }, [mutation.isPending, onPendingChange])

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    try {
      const fields = parseCuentaFields({
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
        caught instanceof Error ? caught.message : 'No se pudo agregar la cuenta'
      setError(message)
    }
  }

  const alertMessage =
    error ??
    (mutation.isError ? mutationErrorMessage(mutation.error) : null) ??
    loadError

  return (
    <form
      className="flex w-full flex-col items-center gap-8"
      noValidate
      onSubmit={onSubmit}
    >
      <div className="flex w-full flex-col gap-2">
        <Label
          htmlFor="cuenta-name"
          className="text-muted-foreground font-medium"
        >
          Nombre
        </Label>
        <Input
          id="cuenta-name"
          name="cuenta-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
          }}
          autoComplete="off"
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <Label
          htmlFor="cuenta-category"
          className="text-muted-foreground font-medium"
        >
          Categoría
        </Label>
        <CategoryCombobox
          id="cuenta-category"
          categories={categories}
          value={category}
          onChange={setCategory}
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <Label
          htmlFor="cuenta-due-date"
          className="text-muted-foreground font-medium"
        >
          Fecha de vencimiento
        </Label>
        {/* Deliberately no `max`/`min` here, unlike the expense form's date
            input -- a Cuenta's due date is explicitly allowed to be in the
            past (e.g. logging an overdue bill) or the future. */}
        <Input
          id="cuenta-due-date"
          name="cuenta-due-date"
          type="date"
          value={dueDate}
          onChange={(event) => {
            setDueDate(event.target.value)
          }}
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <Label
          htmlFor="cuenta-expected-amount"
          className="text-muted-foreground font-medium"
        >
          Monto esperado
        </Label>
        <Input
          id="cuenta-expected-amount"
          name="cuenta-expected-amount"
          value={expectedAmount}
          onChange={(event) => {
            setExpectedAmount(event.target.value)
          }}
          inputMode="decimal"
          autoComplete="off"
        />
      </div>

      <div className="flex w-full items-center justify-between gap-2">
        <Label htmlFor="cuenta-recurring" className="font-medium">
          Recurrente
        </Label>
        <Switch
          id="cuenta-recurring"
          checked={recurring}
          onCheckedChange={setRecurring}
        />
      </div>

      {alertMessage !== null ? (
        <p role="alert" className="text-sm font-medium">
          {alertMessage}
        </p>
      ) : null}

      <Button type="submit" disabled={mutation.isPending}>
        Agregar cuenta
      </Button>
    </form>
  )
}

export function AddCuentaForm({
  db,
  householdId,
  onAdded,
  onPendingChange,
}: AddCuentaFormProps): ReactElement {
  const categoriesQuery = useQuery({
    queryKey: categoriesQueryKey({ householdId }),
    queryFn: () => listCategories({ db, householdId }),
  })

  return (
    <CuentaFormBody
      db={db}
      householdId={householdId}
      categories={categoriesQuery.data ?? []}
      loadError={loadErrorMessage(categoriesQuery.error)}
      onAdded={onAdded}
      onPendingChange={onPendingChange}
    />
  )
}
