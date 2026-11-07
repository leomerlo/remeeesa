import { useState } from 'react'
import type { ReactElement } from 'react'
import type { Card as PaymentMethod, CardPurchase } from '@/lib/cards'
import {
  createCardPurchase,
  deleteCardPurchase,
  updateCardPurchase,
} from '@/lib/cards'
import type { Category, Expense } from '@/lib/expenses'
import { createExpense, deleteExpense, updateExpense } from '@/lib/expenses'
import { createPendiente } from '@/lib/pendientes'
import type { Currency } from '@/lib/money'
import { DangerAction, Sheet, SheetFoot } from '../Sheet'
import { useSave } from '../useSave'
import { kindOf } from '../format'
import type { BetaSession } from '../data'
import {
  DateField,
  MoneyField,
  OptionList,
  SelectField,
  TextField,
  Toggle,
  moneyIsValid,
  moneyValue,
} from '../fields'

// Adding and editing a gasto, with the v1's own rules.
//
// The one that matters: choosing a credit card does not record a gasto at
// all. It records a purchase on that card, which arrives as money only
// when the card's Resumen is paid. That is why the method is a list of
// consequences rather than a dropdown of names -- the choice changes what
// the app writes, and a dropdown hides that.
export type GastoDraft = {
  readonly name: string
  readonly amount: string
  readonly currency: Currency
  readonly categoryId: string
  readonly date: string
  // '' is cash, the method every household has without creating it.
  readonly methodId: string
  readonly cuotas: string
  readonly comments: string
  readonly isService: boolean
  // Only ever read when isService is on, and only when creating: they are
  // what makes a bill a bill rather than one month's figure.
  readonly recurring: boolean
  readonly autoDebit: boolean
}

function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${String(date.getFullYear())}-${month}-${day}`
}

// Midday rather than midnight: a date read back out of the input is local,
// and a midnight that drifts an hour lands on the day before.
function dayFromIso(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1, 12)
}

export function draftFromExpense(
  expense: Expense | null,
  fallbackCategoryId: string,
  today: Date,
): GastoDraft {
  if (expense === null) {
    return {
      name: '',
      amount: '',
      currency: 'ARS',
      categoryId: fallbackCategoryId,
      date: isoDay(today),
      methodId: '',
      cuotas: '1',
      comments: '',
      isService: false,
      // A bill that comes every month is the ordinary case -- that is what
      // makes it a servicio -- and the bank debiting it is not.
      recurring: true,
      autoDebit: false,
    }
  }
  return {
    name: expense.name,
    amount: String(expense.price),
    currency: expense.currency,
    categoryId: expense.categoryId,
    date: isoDay(expense.expenseDate),
    methodId: expense.paymentMethodId ?? '',
    cuotas: '1',
    comments: expense.comments,
    isService: expense.isService,
    recurring: true,
    autoDebit: false,
  }
}

export function draftFromPurchase(purchase: CardPurchase): GastoDraft {
  return {
    name: purchase.name,
    amount: String(purchase.total),
    currency: purchase.currency,
    categoryId: purchase.categoryId,
    date: isoDay(purchase.purchaseDate),
    methodId: purchase.cardId,
    cuotas: String(purchase.cuotas),
    comments: purchase.comments,
    isService: false,
    recurring: true,
    autoDebit: false,
  }
}

export function GastoSheet({
  open,
  onClose,
  session,
  expense,
  purchase = null,
  categories,
  methods,
  today,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly session: BetaSession
  // Null when adding.
  readonly expense: Expense | null
  // Set when what is being edited is a consumo on a credit card rather than
  // a gasto. It is the same form -- a consumo is a gasto that has not
  // happened to the month yet -- so the fields, the validation and the lock
  // are written once.
  readonly purchase?: CardPurchase | null
  readonly categories: readonly Category[]
  readonly methods: readonly PaymentMethod[]
  readonly today: Date
}): ReactElement {
  const [draft, setDraft] = useState<GastoDraft>(() =>
    purchase === null
      ? draftFromExpense(expense, categories[0]?.id ?? '', today)
      : draftFromPurchase(purchase),
  )
  const save = useSave(onClose)
  const set = <K extends keyof GastoDraft>(
    key: K,
    value: GastoDraft[K],
  ): void => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const method = methods.find((candidate) => candidate.id === draft.methodId)
  // Only a credit method changes what gets written. The rest are labels on
  // money that has already gone.
  const onCredit = method?.kind === 'credito'
  const named = draft.name.trim() !== ''
  const priced = moneyIsValid(draft.amount)
  const blocked = !named || !priced || draft.categoryId === ''
  const householdId = session.householdId ?? ''
  const memberId = session.userId ?? ''
  const author = session.displayName ?? 'Alguien'

  // The only reason this form refuses to save: the household has not
  // finished loading, so there is nowhere to write yet.
  const locked: string | null =
    householdId === '' || memberId === ''
      ? 'Todavía estamos leyendo el hogar. Probá de nuevo en un segundo.'
      : null

  const onSave = (): void => {
    save.run(async () => {
      const amount = moneyValue(draft.amount)
      const date = dayFromIso(draft.date)
      if (purchase !== null) {
        return updateCardPurchase({
          db: session.db,
          householdId,
          purchaseId: purchase.id,
          cardId: draft.methodId,
          categoryId: draft.categoryId,
          name: draft.name.trim(),
          total: amount,
          cuotas: Number(draft.cuotas),
          purchaseDate: date,
          comments: draft.comments,
          currency: draft.currency,
        })
      }
      if (expense !== null) {
        return updateExpense({
          db: session.db,
          householdId,
          expenseId: expense.id,
          name: draft.name.trim(),
          price: amount,
          categoryId: draft.categoryId,
          comments: draft.comments,
          expenseDate: date,
          isService: draft.isService,
          currency: draft.currency,
          paymentMethodId: draft.methodId === '' ? null : draft.methodId,
        })
      }
      if (onCredit && method !== undefined) {
        return createCardPurchase({
          db: session.db,
          householdId,
          cardId: method.id,
          categoryId: draft.categoryId,
          memberId,
          authorDisplayName: author,
          name: draft.name.trim(),
          total: amount,
          cuotas: Number(draft.cuotas),
          purchaseDate: date,
          comments: draft.comments,
          currency: draft.currency,
        })
      }
      // Ticking "es un servicio" on something new does not write a gasto at
      // all: a servicio is a bill of the month, and it lives on the
      // Servicios screen until somebody marks it paid. The same toggle on an
      // existing gasto is the v1's own flag, above.
      if (draft.isService) {
        return createPendiente({
          db: session.db,
          householdId,
          categoryId: draft.categoryId,
          name: draft.name.trim(),
          dueDate: date,
          expectedAmount: amount,
          recurring: draft.recurring,
          autoDebit: draft.autoDebit,
          currency: draft.currency,
        })
      }
      return createExpense({
        db: session.db,
        householdId,
        categoryId: draft.categoryId,
        memberId,
        authorDisplayName: author,
        name: draft.name.trim(),
        price: amount,
        comments: draft.comments,
        expenseDate: date,
        currency: draft.currency,
        paymentMethodId: draft.methodId === '' ? null : draft.methodId,
      })
    })
  }

  return (
    <Sheet
      title={title(expense, purchase)}
      open={open}
      onClose={onClose}
      footer={
        <SheetFoot
          label={expense === null && purchase === null ? 'Anotar' : 'Guardar'}
          saving={save.saving}
          blocked={blocked}
          locked={locked}
          failed={save.failed}
          onSave={onSave}
        />
      }
    >
      <TextField
        label="¿Qué fue?"
        value={draft.name}
        onChange={(next) => set('name', next)}
        placeholder="Super, nafta, cumpleaños…"
      />
      <MoneyField
        label="Cuánto"
        prefix={draft.currency === 'USD' ? 'US$' : '$'}
        value={draft.amount}
        onChange={(next) => set('amount', next)}
        {...(draft.currency === 'USD'
          ? {
              hint: 'En dólares: se anota y se muestra, pero no entra en el presupuesto en pesos.',
            }
          : {})}
      />
      <SelectField
        label="Moneda"
        value={draft.currency}
        onChange={(next) => set('currency', next as Currency)}
        options={[
          { value: 'ARS', label: 'Pesos' },
          { value: 'USD', label: 'Dólares' },
        ]}
      />
      <SelectField
        label="Categoría"
        value={draft.categoryId}
        onChange={(next) => set('categoryId', next)}
        options={categories.map((category) => ({
          value: category.id,
          label: category.name,
        }))}
      />
      <DateField
        label="Cuándo"
        value={draft.date}
        onChange={(next) => set('date', next)}
      />
      <OptionList
        label="Con qué lo pagaron"
        value={draft.methodId}
        onChange={(next) => set('methodId', next)}
        // The second line says what kind of method it is, not what it does
        // to the month: "sale hoy" under every option but one was three
        // words of nothing, and cash needs no explaining at all.
        // Editing a consumo offers only the credit cards: a consumo lives
        // on a card by definition, and moving it to cash is not an edit but
        // a different record. Borrarlo y anotarlo de nuevo is the way.
        options={[
          ...(purchase === null ? [{ value: '', k: 'Efectivo' }] : []),
          ...methods
            .filter(
              (candidate) => purchase === null || candidate.kind === 'credito',
            )
            .map((candidate) => ({
              value: candidate.id,
              k: candidate.name,
              ...(candidate.kind === 'efectivo'
                ? {}
                : { v: kindOf(candidate.kind) }),
            })),
        ]}
      />
      {onCredit ? (
        <SelectField
          label="En cuántas cuotas"
          value={draft.cuotas}
          onChange={(next) => set('cuotas', next)}
          hint="Cada cuota cae en un resumen distinto, uno por mes."
          options={[1, 2, 3, 6, 9, 12, 18, 24].map((count) => ({
            value: String(count),
            label: count === 1 ? 'Un solo pago' : `${String(count)} cuotas`,
          }))}
        />
      ) : (
        <Toggle
          k="Es un servicio"
          v={
            expense === null
              ? 'Una cuenta del hogar, no un gasto suelto: se guarda en Servicios y queda por pagar.'
              : 'Marcalo si esto es una cuenta del hogar y no un gasto suelto.'
          }
          checked={draft.isService}
          onChange={(next) => set('isService', next)}
        />
      )}
      {/* Only once it is a servicio, and only when anotando uno nuevo:
          on an existing gasto the toggle above is the v1's own flag and
          writes no bill, so there is nothing for these two to say. The
          same two questions, in the same words, as the Servicios form --
          a servicio anotado from here is the same thing as one anotado
          there. */}
      {draft.isService && expense === null && purchase === null ? (
        <>
          <Toggle
            k="Todos los meses"
            v="Se vuelve a crear solo cuando arranca el mes siguiente."
            checked={draft.recurring}
            onChange={(next) => set('recurring', next)}
          />
          <Toggle
            k="Débito automático"
            v="Lo debita el banco en la fecha. No hace falta marcarlo como pagado: se salda solo cuando pasa el vencimiento."
            checked={draft.autoDebit}
            onChange={(next) => set('autoDebit', next)}
          />
        </>
      ) : null}
      <TextField
        label="Nota"
        value={draft.comments}
        onChange={(next) => set('comments', next)}
        placeholder="Opcional"
      />
      {blocked ? (
        <p className="fproblem" role="alert">
          {!named
            ? 'Falta decir qué fue.'
            : !priced
              ? 'Falta cuánto, y tiene que ser un número mayor que cero.'
              : 'Falta elegir una categoría.'}
        </p>
      ) : null}
      {purchase === null ? null : (
        <DangerAction
          label="Borrar este consumo"
          saving={save.saving}
          locked={locked}
          onPress={() => {
            save.run(() =>
              deleteCardPurchase({
                db: session.db,
                householdId,
                purchaseId: purchase.id,
              }),
            )
          }}
        />
      )}
      {expense === null ? null : (
        <DangerAction
          label="Borrar este gasto"
          saving={save.saving}
          locked={locked}
          onPress={() => {
            save.run(() =>
              deleteExpense({
                db: session.db,
                householdId,
                expenseId: expense.id,
              }),
            )
          }}
        />
      )}
    </Sheet>
  )
}

// A consumo and a gasto are the same form, and the title is where it says
// which one you are looking at.
function title(expense: Expense | null, purchase: CardPurchase | null): string {
  if (purchase !== null) return 'Editar el consumo'
  return expense === null ? 'Anotar un gasto' : 'Editar el gasto'
}
