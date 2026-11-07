import { useState } from 'react'
import type { ReactElement } from 'react'
import type { Card as PaymentMethod } from '@/lib/cards'
import { markPendientePaidWithCard } from '@/lib/cards'
import type { Category } from '@/lib/expenses'
import type { Currency } from '@/lib/money'
import type { Pendiente } from '@/lib/pendientes'
import {
  createPendiente,
  deletePendiente,
  markPendientePaid,
  updatePendiente,
} from '@/lib/pendientes'
import { DangerAction, Sheet, SheetFoot } from '../Sheet'
import { useSave } from '../useSave'
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
import { kindOf, monthName } from '../format'

function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${String(date.getFullYear())}-${month}-${day}`
}

// Midday, so a date read back out of the input cannot drift onto the day
// before.
function dayFromIso(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1, 12)
}

// Adding and editing a servicio -- the luz, the gas, the expensas.
//
// Its amount may be blank, which is the one place in the app where that is
// allowed: a variable bill has no figure until it arrives, and inventing
// one would be worse than leaving it open. Nothing counts a blank.
export function ServicioSheet({
  open,
  onClose,
  session,
  bill,
  categories,
  today,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly session: BetaSession
  readonly bill: Pendiente | null
  readonly categories: readonly Category[]
  readonly today: Date
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
  const save = useSave(onClose)

  const named = name.trim() !== ''
  // Blank is allowed; a number that is not a number is not.
  const priced = moneyIsValid(amount, { required: false })
  const blocked = !named || !priced || categoryId === ''
  const householdId = session.householdId ?? ''
  // The only reason a form here refuses to save: the household has not
  // finished loading, so there is nowhere to write yet.
  const locked: string | null =
    householdId === ''
      ? 'Todavía estamos leyendo el hogar. Probá de nuevo en un segundo.'
      : null

  const onSave = (): void => {
    save.run(() => {
      const expectedAmount = amount.trim() === '' ? null : moneyValue(amount)
      const dueDate = dayFromIso(due)
      if (bill !== null) {
        return updatePendiente({
          db: session.db,
          householdId,
          pendienteId: bill.id,
          categoryId,
          name: name.trim(),
          dueDate,
          expectedAmount,
          recurring,
          autoDebit,
          currency,
        })
      }
      return createPendiente({
        db: session.db,
        householdId,
        categoryId,
        name: name.trim(),
        dueDate,
        expectedAmount,
        recurring,
        autoDebit,
        currency,
      })
    })
  }

  return (
    <Sheet
      title={bill === null ? 'Agregar un servicio' : 'Editar el servicio'}
      open={open}
      onClose={onClose}
      footer={
        <SheetFoot
          label={bill === null ? 'Agregar' : 'Guardar'}
          saving={save.saving}
          blocked={blocked}
          locked={locked}
          failed={save.failed}
          onSave={onSave}
        />
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
      {blocked ? (
        <p className="fproblem" role="alert">
          {!named
            ? 'Falta el nombre del servicio.'
            : !priced
              ? 'El monto tiene que ser un número mayor que cero, o quedar vacío.'
              : 'Falta elegir una categoría.'}
        </p>
      ) : null}
      {bill === null ? null : (
        <DangerAction
          label="Borrar este servicio"
          saving={save.saving}
          locked={locked}
          onPress={() => {
            save.run(() =>
              deletePendiente({
                db: session.db,
                householdId,
                pendienteId: bill.id,
              }),
            )
          }}
        />
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
  session,
  bill,
  methods,
  today,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly session: BetaSession
  readonly bill: Pendiente
  readonly methods: readonly PaymentMethod[]
  readonly today: Date
}): ReactElement {
  const [amount, setAmount] = useState(
    bill.expectedAmount === null ? '' : String(bill.expectedAmount),
  )
  const [paidOn, setPaidOn] = useState(isoDay(today))
  const [methodId, setMethodId] = useState('')
  const save = useSave(onClose)

  const method = methods.find((candidate) => candidate.id === methodId)
  const onCredit = method?.kind === 'credito'
  const priced = moneyIsValid(amount)
  const householdId = session.householdId ?? ''
  const memberId = session.userId ?? ''
  const author = session.displayName ?? 'Alguien'

  const locked: string | null =
    householdId === '' || memberId === ''
      ? 'Todavía estamos leyendo el hogar. Probá de nuevo en un segundo.'
      : null

  const onSave = (): void => {
    save.run(() => {
      const finalAmount = moneyValue(amount)
      const paymentDate = dayFromIso(paidOn)
      if (onCredit && method !== undefined) {
        return markPendientePaidWithCard({
          db: session.db,
          householdId,
          pendienteId: bill.id,
          cardId: method.id,
          memberId,
          authorDisplayName: author,
          finalAmount,
          cuotas: 1,
          paymentDate,
          currency: bill.currency ?? 'ARS',
        })
      }
      return markPendientePaid({
        db: session.db,
        householdId,
        pendienteId: bill.id,
        memberId,
        authorDisplayName: author,
        finalAmount,
        paymentDate,
        paymentMethodId: methodId === '' ? null : methodId,
      })
    })
  }

  return (
    <Sheet
      title={`Pagar ${bill.name}`}
      open={open}
      onClose={onClose}
      footer={
        <SheetFoot
          label="Marcar como pagado"
          saving={save.saving}
          blocked={!priced}
          locked={locked}
          failed={save.failed}
          onSave={onSave}
        />
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
        // What kind of method it is, not what it does to the month: the
        // line below already says the one consequence that matters.
        options={[
          { value: '', k: 'Efectivo' },
          ...methods.map((candidate) => ({
            value: candidate.id,
            k: candidate.name,
            ...(candidate.kind === 'efectivo'
              ? {}
              : { v: kindOf(candidate.kind) }),
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
