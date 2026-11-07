import { Check, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import type { Card as PaymentMethod } from '@/lib/cards'
import type { Category, Expense } from '@/lib/expenses'
import type { Currency } from '@/lib/money'
import { ReadOnlyFoot, Sheet } from '../Sheet'
import {
  DateField,
  MoneyField,
  OptionList,
  SelectField,
  TextField,
  Toggle,
  moneyIsValid,
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
}

function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${String(date.getFullYear())}-${month}-${day}`
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
  }
}

export function GastoSheet({
  open,
  onClose,
  expense,
  categories,
  methods,
  today,
  onDelete,
}: {
  readonly open: boolean
  readonly onClose: () => void
  // Null when adding.
  readonly expense: Expense | null
  readonly categories: readonly Category[]
  readonly methods: readonly PaymentMethod[]
  readonly today: Date
  readonly onDelete?: () => void
}): ReactElement {
  const [draft, setDraft] = useState<GastoDraft>(() =>
    draftFromExpense(expense, categories[0]?.id ?? '', today),
  )
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
  const canSave = named && priced && draft.categoryId !== ''

  return (
    <Sheet
      title={expense === null ? 'Anotar un gasto' : 'Editar el gasto'}
      open={open}
      onClose={onClose}
      footer={
        <div className="sheet-acts">
          <button
            className="btn btn-primary btn-block"
            type="button"
            disabled
            aria-disabled="true"
          >
            <Check />
            {expense === null ? 'Anotar' : 'Guardar'}
          </button>
          <ReadOnlyFoot />
        </div>
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
        options={[
          { value: '', k: 'Efectivo', v: 'Sale hoy' },
          ...methods.map((candidate) => ({
            value: candidate.id,
            k: candidate.name,
            v:
              candidate.kind === 'credito'
                ? 'No sale hoy: va al resumen de la tarjeta'
                : 'Sale hoy',
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
          v="Marcalo si esto es una cuenta del hogar y no un gasto suelto."
          checked={draft.isService}
          onChange={(next) => set('isService', next)}
        />
      )}
      <TextField
        label="Nota"
        value={draft.comments}
        onChange={(next) => set('comments', next)}
        placeholder="Opcional"
      />
      {canSave ? null : (
        <p className="fproblem" role="alert">
          {!named
            ? 'Falta decir qué fue.'
            : !priced
              ? 'Falta cuánto, y tiene que ser un número mayor que cero.'
              : 'Falta elegir una categoría.'}
        </p>
      )}
      {expense === null || onDelete === undefined ? null : (
        <button className="btn btn-danger btn-block" type="button" disabled>
          <Trash2 />
          Borrar este gasto
        </button>
      )}
    </Sheet>
  )
}
