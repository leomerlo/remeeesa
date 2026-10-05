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
import { SheetFooter, SheetScrollArea } from '@/components/ui/sheet'
import { currenciesOf, DEFAULT_CURRENCY } from '@/lib/money'
import type { Currency } from '@/lib/money'
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
import { listCards, PAYMENT_METHOD_KINDS } from '@/lib/cards'
import { cardsQueryKey } from '@/features/household/cardsQueryKey'
import {
  convertExpenseToPendiente,
  getPendiente,
  setPendienteRecurrence,
  unmarkPendientePaid,
  updatePendiente,
} from '@/lib/pendientes'
// Imported from the leaf file, not the @/features/pendientes barrel -- that
// barrel re-exports AddPendienteForm, which imports from this very feature
// (CategoryCombobox), and going through it here would create a
// features/expenses <-> features/pendientes import cycle.
import { pendientesQueryKey } from '@/features/pendientes/queryKeys'
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
  // Whether this Expense is already linked to a real Pendiente. When it is,
  // that Pendiente -- not the Expense -- is where recurrence and "¿ya se
  // pagó?" live, and the three toggles below act on it instead.
  readonly pendienteId: string | null
  // The legacy "count this as a servicio" flag. There is no toggle for it
  // any more: Recurrente took its place (per direct feedback -- it was
  // "el reemplazo de recurrente" wearing the wrong name). It still seeds
  // that toggle, so an Expense flagged before this change shows what it
  // actually is, and switching the toggle off clears the flag.
  readonly isService: boolean
  readonly currency: Currency
  readonly paymentMethodId: string | null
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
  const pendientesKey = pendientesQueryKey({ householdId })
  const [name, setName] = useState(initialFields.name)
  const [price, setPrice] = useState(initialFields.price)
  const [category, setCategory] = useState(initialFields.category)
  const [comments, setComments] = useState(initialFields.comments)
  const [date, setDate] = useState(initialFields.date)
  const [authorMemberId, setAuthorMemberId] = useState(
    editExpense?.memberId ?? memberId,
  )
  // '' is Efectivo: the method every household has without writing it down,
  // which is also what a null payment_method_id has always meant.
  const [cardId, setCardId] = useState(editExpense?.paymentMethodId ?? '')
  const [currency, setCurrency] = useState<Currency>(
    editExpense?.currency ?? DEFAULT_CURRENCY,
  )
  // Null until the member actually touches the switch -- what it shows until
  // then comes from the record itself (see seededRecurring below), which for
  // a servicio only arrives once its Pendiente has loaded.
  const [recurringChoice, setRecurringChoice] = useState<boolean | null>(null)
  const [autoDebitChoice, setAutoDebitChoice] = useState<boolean | null>(null)
  // An Expense exists because money went out, so this starts checked.
  // Switching it off is how a payment is taken back.
  const [markPaid, setMarkPaid] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const today = localDateInputValue(new Date())
  // An Expense that came from paying a Pendiente can't just be deleted --
  // removing it undoes that payment, putting the bill back to pending. The
  // wording below says so rather than promising a plain delete.
  const isFromPendiente =
    editExpense !== null && editExpense.pendienteId !== null
  // A card Resumen's ajuste is negative when less was paid than its total,
  // which no saved expense may be: the only way to change it is undoing the
  // payment.
  const isNegativeAjuste = editExpense !== null && editExpense.price < 0

  // Only fetched for reassigning an existing Expense's author -- adding one
  // always attributes it to whoever is signed in, same as before this
  // feature existed.
  const membersQuery = useQuery({
    queryKey: membersQueryKey({ householdId }),
    queryFn: () => listHouseholdMembers({ db, householdId }),
    enabled: isEditing,
  })
  const members = membersQuery.data ?? []

  const cardsQuery = useQuery({
    queryKey: cardsQueryKey({ householdId }),
    queryFn: () => listCards({ db, householdId }),
    enabled: isEditing,
  })
  // Credit is left out on purpose: paying with credit books a CardPurchase
  // against a Resumen, not a gasto of this month, so moving an existing
  // gasto onto a credit card is not an edit -- it is a different record.
  // Those are edited from the movements list instead.
  const methods = (cardsQuery.data ?? []).filter(
    (card) => card.kind !== 'credito',
  )
  // Left out above, but said below: a list that silently drops half a
  // household's cards reads as broken. Per direct feedback -- "faltan
  // métodos de pago en la lista".
  const hidesCredit = (cardsQuery.data ?? []).some(
    (card) => card.kind === 'credito',
  )
  const method = methods.find((card) => card.id === cardId)

  // The Pendiente behind a servicio: where its recurrence lives, and the
  // only place it can be changed. Also how a card Resumen's own Expenses
  // are recognised -- those are the Resumen's business, not a gasto's.
  const backingPendienteId = editExpense?.pendienteId ?? null
  const pendienteQuery = useQuery({
    queryKey: [...pendientesKey, 'one', backingPendienteId],
    queryFn: () =>
      getPendiente({
        db,
        householdId,
        pendienteId: backingPendienteId ?? '',
      }),
    enabled: backingPendienteId !== null,
  })
  const backing = pendienteQuery.data ?? null
  const isCardResumen = backing !== null && backing.cardId !== undefined
  const isServicio = backingPendienteId !== null

  // What the record says it is, until the member says otherwise. A legacy
  // is_service flag counts: it is what Recurrente replaced.
  const seededRecurring = backing?.recurring ?? editExpense?.isService ?? false
  const seededAutoDebit = backing?.autoDebit ?? false
  const recurring = recurringChoice ?? seededRecurring
  const autoDebit = (autoDebitChoice ?? seededAutoDebit) && recurring

  // Same rule as the alta: the method decides what currency the amount is
  // in, and only a card billed in both leaves it a real choice. The one
  // addition is that a gasto already saved in a currency this method does
  // not hold keeps it on offer -- silently rewriting US$120 into $120 while
  // someone corrects the *method* would not be a correction.
  const methodCurrencies = currenciesOf(method?.currency ?? DEFAULT_CURRENCY)
  const savedCurrency = editExpense?.currency ?? DEFAULT_CURRENCY
  const offered = methodCurrencies.includes(savedCurrency)
    ? methodCurrencies
    : [...methodCurrencies, savedCurrency]
  const narrowedTo = offered.length === 1 ? offered[0] : undefined
  const effectiveCurrency: Currency = narrowedTo ?? currency
  const picksCurrency = narrowedTo === undefined

  // Turning Recurrente on, or "Ya lo pagué" off, asks for a Pendiente --
  // and a Pendiente carries no currency of its own, so a dollar gasto has
  // nowhere to put its dollars. Caught before anything is written.
  const wantsPendiente = (!isServicio && recurring) || !markPaid
  const blockedByCurrency =
    wantsPendiente && effectiveCurrency !== DEFAULT_CURRENCY

  async function invalidateExpenseViews(): Promise<void> {
    // Categories are a separate entity from expenses, so they keep their
    // own exact-key invalidation. The expenses prefix invalidates every
    // consumer nested under it (month-scoped, recent) in one call.
    await queryClient.invalidateQueries({ queryKey: categoriesKey })
    await queryClient.invalidateQueries({ queryKey: expensesKey })
    // Recurrence, undoing a payment and converting a gasto into a servicio
    // all move Pendientes, so Cuentas por pagar has to see it.
    await queryClient.invalidateQueries({ queryKey: pendientesKey })
  }

  const mutation = useMutation({
    mutationFn: async (fields: ParsedExpenseFields) => {
      const resolved = await findOrCreateCategory({
        db,
        householdId,
        name: fields.categoryName,
      })
      if (editExpense === null) {
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
      }
      // Falls back to leaving attribution unchanged if the member list
      // hasn't resolved yet by the time this submits (the query starts
      // fetching the moment the edit form mounts, so this is a narrow
      // window) -- updateExpense's memberId/authorDisplayName are
      // optional precisely for this "nothing to reassign to yet" case.
      const selectedAuthor = members.find(
        (member) => member.userId === authorMemberId,
      )
      const authorPatch =
        selectedAuthor === undefined
          ? {}
          : {
              memberId: selectedAuthor.userId,
              authorDisplayName: selectedAuthor.displayName,
            }

      // A servicio: its Pendiente holds recurrence and the payment, so that
      // is what these toggles act on.
      if (backingPendienteId !== null) {
        if (!markPaid) {
          // Undo the payment first: a paid Pendiente is frozen, so the
          // edits made here only have somewhere to land once it is pending
          // again. Undoing also deletes this very Expense, which is why
          // nothing below writes to it.
          await unmarkPendientePaid({
            db,
            householdId,
            pendienteId: backingPendienteId,
          })
          await updatePendiente({
            db,
            householdId,
            pendienteId: backingPendienteId,
            categoryId: resolved.id,
            name: fields.name,
            dueDate: fields.expenseDate,
            expectedAmount: fields.price,
            recurring,
            autoDebit,
          })
          return
        }
        if (recurring !== seededRecurring || autoDebit !== seededAutoDebit) {
          // The narrow write: everything else on a paid Pendiente is
          // frozen, and this one is not about the payment.
          await setPendienteRecurrence({
            db,
            householdId,
            pendienteId: backingPendienteId,
            recurring,
            autoDebit,
          })
        }
        return updateExpense({
          db,
          householdId,
          expenseId: editExpense.expenseId,
          categoryId: resolved.id,
          name: fields.name,
          price: fields.price,
          comments: fields.comments,
          expenseDate: fields.expenseDate,
          currency: effectiveCurrency,
          paymentMethodId: cardId === '' ? null : cardId,
          ...authorPatch,
        })
      }

      // A plain gasto. Its own fields are saved first so that a conversion
      // below -- which rebuilds the record from what is *stored* -- carries
      // the edits made in this same save.
      const saved = await updateExpense({
        db,
        householdId,
        expenseId: editExpense.expenseId,
        categoryId: resolved.id,
        name: fields.name,
        price: fields.price,
        comments: fields.comments,
        expenseDate: fields.expenseDate,
        currency: effectiveCurrency,
        paymentMethodId: cardId === '' ? null : cardId,
        // Only ever sent to clear a legacy flag the member just switched
        // off. Recurrente otherwise means a real Pendiente, below.
        ...(editExpense.isService && !recurring ? { isService: false } : {}),
        ...authorPatch,
      })
      // Newly asked for: a gasto that was already carrying the legacy
      // is_service flag is left alone unless the switch is touched.
      const asksForRecurrence = recurring && !seededRecurring
      if (asksForRecurrence || !markPaid) {
        await convertExpenseToPendiente({
          db,
          householdId,
          expenseId: editExpense.expenseId,
          recurring,
          autoDebit,
          markPaid,
          memberId: selectedAuthor?.userId ?? memberId,
          authorDisplayName: selectedAuthor?.displayName ?? authorDisplayName,
        })
      }
      return saved
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
  // "Últimos gastos" row itself -- the approved comp shows those rows
  // as plain, buttonless cards, so the only affordance left on a row is
  // tapping it open to edit.
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (editExpense === null) {
        throw new Error('No hay un gasto para eliminar')
      }
      // An Expense created by paying a Pendiente isn't a standalone record:
      // deleting it on its own would leave that Pendiente marked paid and
      // pointing at a document that no longer exists -- money that shows up
      // nowhere, neither spent nor owed. (A real household hit exactly that
      // and ended up with a "ghost" paid bill.) Undoing the payment instead
      // removes the Expense *and* puts the bill back to pending, which is
      // also what deleting one of these actually means.
      if (editExpense.pendienteId !== null) {
        await unmarkPendientePaid({
          db,
          householdId,
          pendienteId: editExpense.pendienteId,
        })
        return
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
      // Undoing a payment puts a Pendiente back to pending, so every
      // Cuentas por pagar view has to see it again.
      await queryClient.invalidateQueries({ queryKey: pendientesKey })
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

  // A gasto still owed is not dated in the past by accident -- but it is
  // allowed to be (an overdue bill), so unlike the alta nothing moves the
  // date here. What does move is the other way round: re-checking "Ya lo
  // pagué" over a future due date would make a paid gasto in the future.
  function onMarkPaidChange(next: boolean): void {
    setMarkPaid(next)
    if (next && date > today) {
      setDate(today)
    }
  }

  function onRecurringChange(next: boolean): void {
    setRecurringChoice(next)
    if (!next) {
      setAutoDebitChoice(false)
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    try {
      if (blockedByCurrency) {
        throw new Error(
          'Un gasto en dólares no puede ser recurrente ni volver a quedar impago: los servicios se llevan solo en pesos.',
        )
      }
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
    loadError ??
    // Without this, a failed load would look like a household with no
    // methods -- i.e. like cash being the only one.
    (cardsQuery.isError ? 'No se pudieron cargar los métodos de pago.' : null)

  // A card Resumen's own Expenses are the Resumen's business: their method,
  // their currency and whether they are paid all come from it, and the way
  // to change any of them is through the Resumen itself.
  const showsMethodAndToggles = isEditing && !isCardResumen

  const submitLabel = !isEditing
    ? 'Agregar gasto'
    : !markPaid
      ? 'Guardar y marcar impago'
      : !isServicio && recurring && !seededRecurring
        ? 'Guardar como servicio'
        : 'Guardar cambios'

  return (
    <form
      className="flex h-full min-h-0 w-full flex-col"
      noValidate
      onSubmit={onSubmit}
    >
      {/* Only this part scrolls -- the action buttons below stay pinned at
          the bottom of the sheet regardless of how tall the field list
          gets, so Guardar/Agregar never requires scrolling to reach. */}
      <SheetScrollArea>
        {/* No heading of its own: the Sheet draws a real header row with
            this exact title in it, so one here said "Editar gasto" twice,
            one line apart. */}
        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="expense-name">Nombre</Label>
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

        {/* Before the amount, in the same order as the alta: the method
            decides what currency the amount is in, so the field's prefix is
            already right by the time you look at it. Correcting it used to
            be impossible -- a gasto logged against the wrong method had to
            be deleted and added again. Per direct feedback. */}
        {showsMethodAndToggles ? (
          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="expense-paid-with">Método de pago</Label>
            <Select
              id="expense-paid-with"
              name="expense-paid-with"
              value={cardId}
              onChange={(event) => {
                setCardId(event.target.value)
              }}
            >
              <option value="">Efectivo</option>
              {methods.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </Select>
            <p className="text-muted-foreground text-xs">
              {method === undefined
                ? 'Plata en mano, en pesos. Agregá otros en Ajustes.'
                : (PAYMENT_METHOD_KINDS.find(
                    (option) => option.value === method.kind,
                  )?.detail ?? '')}
            </p>
            {hidesCredit ? (
              <p className="text-muted-foreground text-xs">
                Tus tarjetas de crédito no están en esta lista: lo que se paga
                con crédito no sale este mes, va al resumen del mes que viene.
                Para pasarlo a una, borrá esto y cargalo de nuevo eligiendo la
                tarjeta.
              </p>
            ) : null}
            {cardsQuery.isSuccess && methods.length === 0 ? (
              <Link
                to="/household"
                className="text-primary self-start text-sm font-medium underline-offset-4 hover:underline"
              >
                Agregar un método de pago en Ajustes
              </Link>
            ) : null}
          </div>
        ) : null}

        {/* At ordinary field size, and after the name -- you know what you
            bought before you know what it cost. It used to lead at hero
            size, which pushed everything below it, the toggles included,
            further down a sheet that already scrolls. Per direct feedback. */}
        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="expense-price">
            {markPaid ? 'Precio' : 'Monto esperado'}
          </Label>
          <div className="flex w-full items-center gap-2">
            {/* The currency sits with the amount because that is what it
                qualifies. With a method chosen it usually stops being a
                choice: the method's own currency is shown instead. */}
            {showsMethodAndToggles && picksCurrency ? (
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
                id="expense-price"
                name="expense-price"
                value={price}
                onChange={setPrice}
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
          <Label htmlFor="expense-category">Categoría</Label>
          <CategoryCombobox
            id="expense-category"
            categories={categories}
            value={category}
            onChange={setCategory}
            placeholder="Elegí o escribí una nueva"
          />
        </div>

        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="expense-comments">Comentario</Label>
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
          <Label htmlFor="expense-date">
            {markPaid ? 'Fecha' : 'Fecha de vencimiento'}
          </Label>
          {/* Capped at today only while it means "cuándo lo pagaste" -- a
              due date is allowed to be overdue, or still ahead. */}
          <Input
            id="expense-date"
            name="expense-date"
            type="date"
            value={date}
            max={markPaid ? today : undefined}
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
            <Label htmlFor="expense-author">Autor</Label>
            <Select
              id="expense-author"
              name="expense-author"
              value={authorMemberId}
              onChange={(event) => {
                setAuthorMemberId(event.target.value)
              }}
              className="text-sm"
            >
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {/* The same three the alta has, and for the same reason: they are
            about the gasto -- does it repeat, does the bank take it on its
            own, has it happened yet -- and all three are answers a member
            can get wrong at the moment of logging. This used to be a single
            "Marcar como servicio" switch, a label with no recurrence behind
            it; per direct feedback it was "el reemplazo de recurrente", so
            Recurrente took its place and does the real thing.

            Tighter than the fields above: three one-line switches are one
            group, and at the form's own spacing they read as three
            unrelated questions. */}
        {showsMethodAndToggles ? (
          <div className="flex w-full flex-col gap-1">
            <div className="flex min-h-[46px] w-full items-center gap-3 lg:min-h-0">
              <Switch
                id="expense-recurring"
                checked={recurring}
                onCheckedChange={onRecurringChange}
              />
              <Label htmlFor="expense-recurring">Recurrente</Label>
            </div>
            <div className="flex min-h-[46px] w-full items-center gap-3 lg:min-h-0">
              <Switch
                id="expense-auto-debit"
                checked={autoDebit}
                disabled={!recurring}
                onCheckedChange={setAutoDebitChoice}
              />
              <Label htmlFor="expense-auto-debit">Débito automático</Label>
            </div>
            <div className="flex min-h-[46px] w-full items-center gap-3 lg:min-h-0">
              <Switch
                id="expense-mark-paid"
                checked={markPaid}
                onCheckedChange={onMarkPaidChange}
              />
              <Label htmlFor="expense-mark-paid">Ya lo pagué</Label>
            </div>
          </div>
        ) : null}

        {/* Said before saving, not after: both of these change *what the
            record is*, and the member is the one who decided to. */}
        {!markPaid ? (
          <p className="text-muted-foreground text-xs">
            Al guardar, esto vuelve a quedar como cuenta por pagar y sale de los
            gastos del mes.
          </p>
        ) : !isServicio && recurring && !seededRecurring ? (
          <p className="text-muted-foreground text-xs">
            Al guardar, este gasto pasa a ser un servicio y lo vas a poder
            llevar al mes que viene.
          </p>
        ) : null}

        {isNegativeAjuste ? (
          <p className="text-muted-foreground text-xs">
            Es el ajuste de un resumen pagado: para cambiarlo, deshacé el pago.
          </p>
        ) : null}

        {alertMessage !== null ? (
          <AlertMessage>{alertMessage}</AlertMessage>
        ) : null}
      </SheetScrollArea>

      <SheetFooter>
        {confirmingDelete ? (
          <div
            role="alertdialog"
            aria-labelledby="delete-expense-title"
            className="bg-card flex w-full flex-col gap-4 rounded-2xl border border-border p-4"
          >
            <p id="delete-expense-title" className="text-sm font-medium">
              {isFromPendiente
                ? '¿Deshacer el pago? Se borra lo que generó el pago y vuelve a quedar impago.'
                : '¿Eliminar el gasto?'}
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
                {isFromPendiente ? 'Deshacer pago' : 'Eliminar gasto'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center gap-2">
            <Button
              type="submit"
              disabled={mutation.isPending || isNegativeAjuste}
              className="w-full"
            >
              {submitLabel}
            </Button>
            {isEditing ? (
              <>
                {/* No "Cancelar edición": the sheet's own header has a
                    close control, and a second way out of the same screen
                    only made the footer longer. Per direct feedback. */}
                <Button
                  type="button"
                  variant="destructive-outline"
                  className="w-full"
                  disabled={mutation.isPending}
                  onClick={() => {
                    setError(null)
                    setConfirmingDelete(true)
                  }}
                >
                  {isFromPendiente ? 'Deshacer pago' : 'Eliminar gasto'}
                </Button>
              </>
            ) : null}
          </div>
        )}
      </SheetFooter>
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
