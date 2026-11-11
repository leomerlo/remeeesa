import { Banknote } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import type { Card as PaymentMethod, CardPurchase } from '@/lib/cards'
import {
  createCardPurchase,
  deleteCardPurchase,
  updateCardPurchase,
} from '@/lib/cards'
import type { Category, Expense } from '@/lib/expenses'
import {
  createExpense,
  deleteExpense,
  findOrCreateCategory,
  updateExpense,
} from '@/lib/expenses'
import { createPendiente, markPendientePaid } from '@/lib/pendientes'
import type { Currency } from '@/lib/money'
import { CardBrandMark } from '../CardBrandMark'
import { DangerAction, Sheet, SheetFoot } from '../Sheet'
import { useSave } from '../useSave'
import { kindOf } from '../format'
import type { BetaSession } from '../data'
import {
  DateField,
  MoneyRow,
  PickField,
  CategoryField,
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
  // A category nobody has yet, named here rather than created here: the
  // save resolves it with findOrCreateCategory, so abandoning the form
  // leaves nothing behind. Empty whenever an existing one is chosen, and
  // the two are never both set.
  readonly categoryName: string
  readonly date: string
  // '' is cash, the method every household has without creating it.
  readonly methodId: string
  readonly cuotas: string
  readonly comments: string
  // The v1's two questions, which between them decide what gets written:
  // a one-off already paid is a gasto, and anything else is a bill of the
  // month -- created, and settled on the spot if it was already paid.
  readonly recurring: boolean
  readonly autoDebit: boolean
  readonly paid: boolean
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
      categoryName: '',
      date: isoDay(today),
      methodId: '',
      cuotas: '1',
      comments: '',
      // A gasto is a one-off already paid: that is what anotar un gasto
      // means, and the two switches are there for when it is not.
      recurring: false,
      autoDebit: false,
      paid: true,
    }
  }
  return {
    name: expense.name,
    amount: String(expense.price),
    currency: expense.currency,
    categoryId: expense.categoryId,
    categoryName: '',
    date: isoDay(expense.expenseDate),
    methodId: expense.paymentMethodId ?? '',
    cuotas: '1',
    comments: expense.comments,
    recurring: false,
    autoDebit: false,
    paid: true,
  }
}

export function draftFromPurchase(purchase: CardPurchase): GastoDraft {
  return {
    name: purchase.name,
    amount: String(purchase.total),
    currency: purchase.currency,
    categoryId: purchase.categoryId,
    categoryName: '',
    date: isoDay(purchase.purchaseDate),
    methodId: purchase.cardId,
    cuotas: String(purchase.cuotas),
    comments: purchase.comments,
    recurring: false,
    autoDebit: false,
    paid: true,
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

  // Asked whatever the answer to "Ya lo pagué" is, because a bill has an
  // answer too: the bank debits the luz from one particular card every
  // month. What changes is what it means -- what this was paid with, or
  // what it is going to be paid with.
  const chosen = methods.find((candidate) => candidate.id === draft.methodId)
  // Only what has already been paid decides what gets written now: a
  // credit card books a consumo, and nothing can be a consumo before it
  // is bought.
  const method = draft.paid ? chosen : undefined
  // Only a credit method changes what gets written. The rest are labels on
  // money that has already gone.
  const onCredit = method?.kind === 'credito'
  const named = draft.name.trim() !== ''
  // A bill that has not been paid may not have a figure yet -- the light
  // bill arrives when it arrives -- and that is the one case where the
  // amount can be left empty. The v1 draws the line in the same place.
  const needsAmount = draft.paid || onCredit
  const priced = moneyIsValid(draft.amount, { required: needsAmount })
  const blocked =
    !named ||
    !priced ||
    (draft.categoryId === '' && draft.categoryName.trim() === '')
  // What is missing, said only once they have started filling it in. A
  // form that opens already complaining is telling somebody off for not
  // having typed yet -- the empty form is its own explanation, and the
  // save button is held shut anyway. The category does not count: it
  // comes already chosen, so it would make every form start out guilty.
  const started = named || draft.amount.trim() !== ''
  const householdId = session.householdId ?? ''
  const memberId = session.userId ?? ''
  const author = session.displayName ?? 'Alguien'

  // The only reason this form refuses to save: the household has not
  // finished loading, so there is nowhere to write yet.
  const locked: string | null =
    householdId === '' || memberId === ''
      ? 'Todavía estamos leyendo el hogar. Probá de nuevo en un segundo.'
      : null

  // Every way this household pays, each with its own mark. Efectivo is the
  // one nobody creates, so it is written in here rather than read.
  //
  // Editing a consumo offers only the credit cards: a consumo lives on a
  // card by definition, and moving it to cash is not an edit but a
  // different record -- borrarlo y anotarlo de nuevo is the way. Editing a
  // gasto offers everything but credit, for the mirror reason: paying with
  // credit books a consumo, not a gasto.
  const offered = methods.filter((candidate) =>
    purchase !== null
      ? candidate.kind === 'credito'
      : expense === null || candidate.kind !== 'credito',
  )
  const methodOptions = [
    ...(purchase === null
      ? [{ value: '', k: 'Efectivo o transferencia', mark: <Banknote /> }]
      : []),
    ...offered.map((candidate) => ({
      value: candidate.id,
      k: candidate.name,
      ...(candidate.kind === 'efectivo' ? {} : { v: kindOf(candidate.kind) }),
      mark: <CardBrandMark brand={candidate.brand} />,
    })),
    // Whatever it was actually saved with, when that is not on the list
    // above -- a gasto paid with a credit card before this form stopped
    // offering them. Shown rather than silently swapped for the first
    // option on save.
    ...methods
      .filter(
        (candidate) =>
          candidate.id === draft.methodId &&
          !offered.some((one) => one.id === candidate.id),
      )
      .map((candidate) => ({
        value: candidate.id,
        k: candidate.name,
        v: kindOf(candidate.kind),
        mark: <CardBrandMark brand={candidate.brand} />,
      })),
  ]

  // Under the amount, and only when there is something to say about it.
  const amountSays =
    draft.currency === 'USD'
      ? 'En dólares: se anota y se muestra, pero no entra en el presupuesto en pesos.'
      : draft.paid
        ? null
        : 'Si todavía no sabés cuánto, dejalo vacío.'

  const onSave = (): void => {
    save.run(async () => {
      const amount = moneyValue(draft.amount)
      const date = dayFromIso(draft.date)
      // A name typed into the category box becomes a category here and
      // nowhere earlier -- one lookup, before any of the branches below,
      // so every one of them is given an id that exists.
      const categoryId =
        draft.categoryName.trim() === ''
          ? draft.categoryId
          : (
              await findOrCreateCategory({
                db: session.db,
                householdId,
                name: draft.categoryName.trim(),
              })
            ).id
      if (purchase !== null) {
        return updateCardPurchase({
          db: session.db,
          householdId,
          purchaseId: purchase.id,
          cardId: draft.methodId,
          categoryId,
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
          categoryId,
          comments: draft.comments,
          expenseDate: date,
          // Left exactly as it was found. It is the v1's old flag, which
          // nothing writes true any more; editing a gasto is no reason to
          // change what it already says.
          isService: expense.isService,
          currency: draft.currency,
          paymentMethodId: draft.methodId === '' ? null : draft.methodId,
        })
      }
      if (onCredit && method !== undefined) {
        return createCardPurchase({
          db: session.db,
          householdId,
          cardId: method.id,
          categoryId,
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
      // From here on it is the v1's own decision, in its order: a one-off
      // already paid is a gasto and nothing else. Everything else is a
      // bill of the month -- it comes every month, or it is still owed --
      // so it is written as one and then settled on the spot if it was
      // already paid. That is what makes it come back next month.
      if (draft.recurring || !draft.paid) {
        const created = await createPendiente({
          db: session.db,
          householdId,
          categoryId,
          name: draft.name.trim(),
          dueDate: date,
          expectedAmount: draft.amount.trim() === '' ? null : amount,
          recurring: draft.recurring,
          autoDebit: draft.autoDebit,
          // What it is paid with, which on a débito automático is the
          // card the bank takes it from.
          paymentMethodId: draft.methodId === '' ? null : draft.methodId,
          currency: draft.currency,
        })
        if (!draft.paid) return created
        return markPendientePaid({
          db: session.db,
          householdId,
          pendienteId: created.id,
          memberId,
          authorDisplayName: author,
          finalAmount: amount,
          paymentDate: date,
          paymentMethodId: draft.methodId === '' ? null : draft.methodId,
        })
      }
      return createExpense({
        db: session.db,
        householdId,
        categoryId,
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
      {/* Before the amount, because it is the answer that decides what the
          amount is: on a credit card it is not money leaving this month at
          all. A dropdown with each method's own logo rather than a column
          of big radios -- the list was taking more of the form than the
          figure was, and a card is recognised by its logo before its name
          is read. */}
      <PickField
        label={draft.paid ? '¿Con qué lo pagaron?' : '¿Con qué se paga?'}
        value={draft.methodId}
        onChange={(next) => set('methodId', next)}
        options={methodOptions}
        {...(draft.paid
          ? {}
          : {
              hint: draft.autoDebit
                ? 'De acá lo va a debitar el banco cuando venza.'
                : 'Lo que va a venir propuesto cuando lo marques como pagado.',
            })}
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
      ) : null}
      <MoneyRow
        label={draft.paid ? 'Cuánto' : 'Cuánto va a ser'}
        amount={draft.amount}
        onAmount={(next) => set('amount', next)}
        currency={draft.currency}
        onCurrency={(next) => set('currency', next as Currency)}
        currencies={[
          { value: 'ARS', label: '$' },
          { value: 'USD', label: 'US$' },
        ]}
        {...(amountSays === null ? {} : { hint: amountSays })}
      />
      <CategoryField
        label="Categoría"
        value={draft.categoryId}
        newName={draft.categoryName}
        onPick={(next) => set('categoryId', next)}
        onName={(next) => set('categoryName', next)}
        categories={categories}
      />
      <DateField
        label={draft.paid ? 'Cuándo' : 'Cuándo vence'}
        value={draft.date}
        onChange={(next) => set('date', next)}
      />
      {/* The three questions that decide what this becomes, and only when
          anotando algo nuevo: an existing record already is one thing or
          the other, and turning a saved gasto into a servicio is a
          conversion rather than an edit.

          None of them on a credit card: a consumo already happened, it
          does not come every month, and the bank does not debit it. */}
      {expense === null && purchase === null && !onCredit ? (
        <>
          <Toggle
            k="Ya lo pagué"
            v="Si no, queda esperando en Servicios con esa fecha de vencimiento."
            checked={draft.paid}
            onChange={(next) => {
              setDraft((current) => ({ ...current, paid: next }))
            }}
          />
          <Toggle
            k="Todos los meses"
            v="Se vuelve a crear solo cuando arranca el mes siguiente."
            checked={draft.recurring}
            onChange={(next) => {
              // Switching it off takes the bank's debit with it, or it
              // would come back the moment it is switched on again.
              setDraft((current) => ({
                ...current,
                recurring: next,
                autoDebit: next ? current.autoDebit : false,
              }))
            }}
          />
          <Toggle
            k="Débito automático"
            v="Lo debita el banco en la fecha. No hace falta marcarlo como pagado: se salda solo cuando pasa el vencimiento."
            checked={draft.autoDebit}
            disabled={!draft.recurring}
            onChange={(next) => set('autoDebit', next)}
          />
        </>
      ) : null}
      {blocked && started ? (
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
