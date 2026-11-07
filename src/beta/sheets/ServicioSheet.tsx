import { Check, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import type { Card as PaymentMethod } from '@/lib/cards'
import type { Category } from '@/lib/expenses'
import type { Currency } from '@/lib/money'
import type { Pendiente } from '@/lib/pendientes'
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
import { monthName } from '../format'

function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${String(date.getFullYear())}-${month}-${day}`
}

// Adding and editing a servicio -- the luz, the gas, the expensas.
//
// Its amount may be blank, which is the one place in the app where that is
// allowed: a variable bill has no figure until it arrives, and inventing
// one would be worse than leaving it open. Nothing counts a blank.
export function ServicioSheet({
  open,
  onClose,
  bill,
  categories,
  today,
  onDelete,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly bill: Pendiente | null
  readonly categories: readonly Category[]
  readonly today: Date
  readonly onDelete?: () => void
}): ReactElement {
  const [name, setName] = useState(bill?.name ?? '')
  const [amount, setAmount] = useState(
    bill?.expectedAmount === null || bill?.expectedAmount === undefined
      ? ''
      : String(bill.expectedAmount),
  )
  const [currency, setCurrency] = useState<Currency>(bill?.currency ?? 'ARS')
  const [categoryId, setCategoryId] = useState(
    bill?.categoryId ?? categories[0]?.id ?? '',
  )
  const [due, setDue] = useState(isoDay(bill?.dueDate ?? today))
  const [recurring, setRecurring] = useState(bill?.recurring ?? true)
  const [autoDebit, setAutoDebit] = useState(bill?.autoDebit ?? false)

  const named = name.trim() !== ''
  // Blank is allowed; a number that is not a number is not.
  const priced = moneyIsValid(amount, { required: false })
  const canSave = named && priced && categoryId !== ''

  return (
    <Sheet
      title={bill === null ? 'Agregar un servicio' : 'Editar el servicio'}
      open={open}
      onClose={onClose}
      footer={
        <div className="sheet-acts">
          <button className="btn btn-primary btn-block" type="button" disabled>
            <Check />
            {bill === null ? 'Agregar' : 'Guardar'}
          </button>
          <ReadOnlyFoot />
        </div>
      }
    >
      <TextField
        label="¿Qué servicio es?"
        value={name}
        onChange={setName}
        placeholder="Luz, gas, expensas…"
      />
      <MoneyField
        label="Cuánto"
        prefix={currency === 'USD' ? 'US$' : '$'}
        value={amount}
        onChange={setAmount}
        hint="Si todavía no sabés el monto, dejalo vacío: va a decir «A confirmar» y no cuenta contra el presupuesto hasta que lo pongas."
      />
      <SelectField
        label="Moneda"
        value={currency}
        onChange={(next) => setCurrency(next as Currency)}
        options={[
          { value: 'ARS', label: 'Pesos' },
          { value: 'USD', label: 'Dólares' },
        ]}
      />
      <SelectField
        label="Categoría"
        value={categoryId}
        onChange={setCategoryId}
        options={categories.map((category) => ({
          value: category.id,
          label: category.name,
        }))}
      />
      <DateField label="Vence el" value={due} onChange={setDue} />
      <Toggle
        k="Todos los meses"
        v="Se vuelve a crear solo cuando arranca el mes siguiente."
        checked={recurring}
        onChange={setRecurring}
      />
      <Toggle
        k="Débito automático"
        v="Lo debita el banco en la fecha. No hace falta marcarlo como pagado: se salda solo cuando pasa el vencimiento."
        checked={autoDebit}
        onChange={setAutoDebit}
      />
      {canSave ? null : (
        <p className="fproblem" role="alert">
          {!named
            ? 'Falta el nombre del servicio.'
            : !priced
              ? 'El monto tiene que ser un número mayor que cero, o quedar vacío.'
              : 'Falta elegir una categoría.'}
        </p>
      )}
      {bill === null || onDelete === undefined ? null : (
        <button className="btn btn-danger btn-block" type="button" disabled>
          <Trash2 />
          Borrar este servicio
        </button>
      )}
    </Sheet>
  )
}

// Marking a servicio as paid, which is where a bill turns into money.
//
// The amount is asked for again because the figure that arrives is almost
// never the figure that was expected, and paying with a credit card is
// offered as its own answer because it is a different event: the money
// does not leave now, it goes onto the card.
export function PagarSheet({
  open,
  onClose,
  bill,
  methods,
  today,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly bill: Pendiente
  readonly methods: readonly PaymentMethod[]
  readonly today: Date
}): ReactElement {
  const [amount, setAmount] = useState(
    bill.expectedAmount === null ? '' : String(bill.expectedAmount),
  )
  const [paidOn, setPaidOn] = useState(isoDay(today))
  const [methodId, setMethodId] = useState('')

  const method = methods.find((candidate) => candidate.id === methodId)
  const onCredit = method?.kind === 'credito'
  const priced = moneyIsValid(amount)

  return (
    <Sheet
      title={`Pagar ${bill.name}`}
      open={open}
      onClose={onClose}
      footer={
        <div className="sheet-acts">
          <button className="btn btn-primary btn-block" type="button" disabled>
            <Check />
            Marcar como pagado
          </button>
          <ReadOnlyFoot />
        </div>
      }
    >
      <MoneyField
        label="Cuánto pagaron"
        prefix={(bill.currency ?? 'ARS') === 'USD' ? 'US$' : '$'}
        value={amount}
        onChange={setAmount}
        {...(bill.expectedAmount === null
          ? {}
          : {
              hint: `Lo esperado era $${String(bill.expectedAmount)}. Si vino distinto, poné lo que pagaste de verdad.`,
            })}
      />
      <DateField label="Cuándo" value={paidOn} onChange={setPaidOn} />
      <OptionList
        label="Con qué lo pagaron"
        value={methodId}
        onChange={setMethodId}
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
        <p className="fnote">
          Esta plata no sale este mes. Va al resumen de{' '}
          {monthName(new Date(today.getFullYear(), today.getMonth() + 1, 1))} de{' '}
          {method?.name ?? 'la tarjeta'}.
        </p>
      ) : null}
      {priced ? null : (
        <p className="fproblem" role="alert">
          Falta cuánto pagaron, y tiene que ser un número mayor que cero.
        </p>
      )}
    </Sheet>
  )
}
