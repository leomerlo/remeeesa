import { Banknote, Check, Undo2 } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import type { Card as PaymentMethod } from '@/lib/cards'
import { markPendientePaidWithCard } from '@/lib/cards'
import type { Category } from '@/lib/expenses'
import type { Currency } from '@/lib/money'
import type { Pendiente } from '@/lib/pendientes'
import {
  amountLeft,
  createPendiente,
  deletePendiente,
  isPartlyPaid,
  markPendientePaid,
  paidSoFar,
  payPendientePartially,
  undoLastPartialPayment,
  unmarkPendientePaid,
  updatePendiente,
} from '@/lib/pendientes'
import { CardBrandMark } from '../CardBrandMark'
import { DangerAction, Sheet, SheetFoot } from '../Sheet'
import { useSave } from '../useSave'
import type { BetaSession } from '../data'
import {
  DateField,
  MoneyField,
  MoneyRow,
  PickField,
  SelectField,
  TextField,
  Toggle,
  moneyIsValid,
  moneyValue,
  pesos,
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
  methods,
  today,
  paidWith = null,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly session: BetaSession
  readonly bill: Pendiente | null
  readonly categories: readonly Category[]
  // Every way the household pays, so a servicio can say which one it goes
  // out on -- the same question anotar un gasto asks, asked the same way.
  readonly methods: readonly PaymentMethod[]
  readonly today: Date
  // What the payment was actually made with, where it has been paid. A
  // different thing from the field above: that one is what the bill is
  // normally paid with, this one is what happened. A servicio can go in
  // cash one month and on a card the next.
  readonly paidWith?: string | null
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
  // '' is cash, the method every household has without creating one.
  const [methodId, setMethodId] = useState(bill?.paymentMethodId ?? '')
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
          paymentMethodId: methodId === '' ? null : methodId,
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
        paymentMethodId: methodId === '' ? null : methodId,
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
      {/* Before the amount, where anotar un gasto asks it, and with the
          same dropdown. A servicio does have an answer to this: the bank
          debits the luz from one particular card every month, and nobody
          is there to choose when it happens. */}
      <PickField
        label="¿Con qué se paga?"
        value={methodId}
        onChange={setMethodId}
        options={[
          { value: '', k: 'Efectivo o transferencia', mark: <Banknote /> },
          ...methods.map((candidate) => ({
            value: candidate.id,
            k: candidate.name,
            ...(candidate.kind === 'efectivo'
              ? {}
              : { v: kindOf(candidate.kind) }),
            mark: <CardBrandMark brand={candidate.brand} />,
          })),
        ]}
        hint={
          autoDebit
            ? 'De acá lo debita el banco cuando vence.'
            : 'Lo que viene propuesto cuando lo marques como pagado. Si ese día pagás con otra cosa, elegís otra.'
        }
      />
      {/* The same field anotar un gasto asks the amount with: the currency
          on the same line, as the sign it is, rather than a question of
          its own underneath. */}
      <MoneyRow
        label="Cuánto"
        amount={amount}
        onAmount={setAmount}
        currency={currency}
        onCurrency={(next) => setCurrency(next as Currency)}
        currencies={[
          { value: 'ARS', label: '$' },
          { value: 'USD', label: 'US$' },
        ]}
        hint="Si todavía no sabés el monto, dejalo vacío: va a decir «A confirmar» y no cuenta contra el presupuesto hasta que lo pongas."
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
      {/* A bill with part of it already in. Same escape hatch a paid bill
          has, one payment at a time: the amount was typed by hand, so the
          way out of a figure typed wrong cannot be to pay the rest. */}
      {bill === null || !isPartlyPaid(bill) ? null : (
        <>
          <p className="fnote">
            Ya van {pesos(paidSoFar(bill))} de{' '}
            {pesos(bill.expectedAmount ?? 0)}, así que falta{' '}
            {pesos(amountLeft(bill) ?? 0)}. Deshacer el último pago le
            devuelve eso al servicio y saca el gasto que ese pago había
            anotado.
          </p>
          <button
            className="btn btn-secondary btn-block"
            type="button"
            disabled={save.saving || locked !== null}
            onClick={() => {
              save.run(() =>
                undoLastPartialPayment({
                  db: session.db,
                  householdId,
                  pendienteId: bill.id,
                }),
              )
            }}
          >
            <Undo2 />
            Deshacer el último pago
          </button>
        </>
      )}
      {bill === null || bill.status !== 'paid' ? null : (
        <>
          {paidWith === null ? null : (
            <div className="field">
              <span className="flabel">Pagado con</span>
              <p className="codebox">{paidWith}</p>
            </div>
          )}
          <p className="fnote">
            Esto es con qué se pagó esta vez. Arriba está con qué se paga
            normalmente, que es lo que va a proponer la próxima: el mismo
            servicio puede ir en efectivo un mes y con tarjeta el siguiente.
            Para cambiar este pago, deshacelo y volvé a pagarlo.
          </p>
          <p className="fnote">
            Deshacer el pago lo devuelve a la lista de lo que falta pagar, y
            saca el gasto que ese pago había anotado. Si lo pagaron con tarjeta,
            también saca el consumo del resumen.
          </p>
          <button
            className="btn btn-secondary btn-block"
            type="button"
            disabled={save.saving || locked !== null}
            onClick={() => {
              save.run(() =>
                unmarkPendientePaid({
                  db: session.db,
                  householdId,
                  pendienteId: bill.id,
                }),
              )
            }}
          >
            <Undo2 />
            Deshacer el pago
          </button>
        </>
      )}
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
  // What is left on it, which on all but a part-paid bill is the whole
  // figure: a bill with $40.000 already in asks for the other $60.000,
  // and offering the full figure again would pay it twice.
  const left = amountLeft(bill)
  const [amount, setAmount] = useState(left === null ? '' : String(left))
  const [paidOn, setPaidOn] = useState(isoDay(today))
  // "No llevo el total": the money handed over goes in as a Gasto of its
  // own and the bill stays open owing the rest. Per direct feedback.
  const [onlyPart, setOnlyPart] = useState(false)
  // What the bill says it is paid with, which is what it will almost
  // always be paid with. Still a choice: this month it may go on another
  // card, and that is what the field is for.
  const [methodId, setMethodId] = useState(bill.paymentMethodId ?? '')
  const save = useSave(onClose)

  const method = methods.find((candidate) => candidate.id === methodId)
  const onCredit = method?.kind === 'credito'
  const priced = moneyIsValid(amount)
  // Handing over part of it only means anything when the bill knows what
  // it asks for and what is being handed over is less than that. On
  // credit nothing leaves today, so there is no part of it to hand over.
  const canSplit =
    left !== null && !onCredit && priced && moneyValue(amount) < left
  const partial = canSplit && onlyPart
  const stillOwed = partial ? left - moneyValue(amount) : 0
  const householdId = session.householdId ?? ''
  const memberId = session.userId ?? ''
  const author = session.displayName ?? 'Alguien'

  const locked: string | null =
    householdId === '' || memberId === ''
      ? 'Todavía estamos leyendo el hogar. Probá de nuevo en un segundo.'
      : null

  // The figure arrived, but nobody has paid it yet: the bill keeps the
  // new amount and goes on waiting. Without this the only way out of this
  // form was paying, so correcting a figure meant claiming money had left
  // the account.
  const onJustSave = (): void => {
    save.run(() =>
      updatePendiente({
        db: session.db,
        householdId,
        pendienteId: bill.id,
        expectedAmount: moneyValue(amount),
      }),
    )
  }

  const onSave = (): void => {
    save.run(() => {
      const finalAmount = moneyValue(amount)
      const paymentDate = dayFromIso(paidOn)
      if (partial) {
        return payPendientePartially({
          db: session.db,
          householdId,
          pendienteId: bill.id,
          memberId,
          authorDisplayName: author,
          amount: finalAmount,
          paymentDate,
          paymentMethodId: methodId === '' ? null : methodId,
        })
      }
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
          label={partial ? 'Guardar lo que pagué' : 'Marcar como pagado'}
          saving={save.saving}
          blocked={!priced}
          locked={locked}
          failed={save.failed}
          onSave={onSave}
          secondary={{
            label: 'Guardar el monto',
            icon: <Check />,
            onPress: onJustSave,
          }}
        />
      }
    >
      {/* "Cuánto pagaron" with the footer offering to save it and
          nothing else: the bill arrives before it is paid, and writing
          its real figure down is not the same as saying the money left. */}
      <MoneyField
        label="Cuánto pagaron"
        prefix={(bill.currency ?? 'ARS') === 'USD' ? 'US$' : '$'}
        value={amount}
        onChange={setAmount}
        {...(bill.expectedAmount === null
          ? {}
          : {
              hint: isPartlyPaid(bill)
                ? `Ya van ${pesos(paidSoFar(bill))} de ${pesos(bill.expectedAmount)}, así que falta ${pesos(left ?? 0)}.`
                : `Lo esperado era ${pesos(bill.expectedAmount)}. Si vino distinto, poné lo que pagaste de verdad.`,
            })}
      />
      <DateField label="Cuándo" value={paidOn} onChange={setPaidOn} />
      {/* The same dropdown anotar un gasto asks with, because it is the
          same question: every method the household has, each wearing its
          own logo. The second line says what kind of method it is, not
          what it does to the month -- the note below says the one
          consequence that matters. */}
      <PickField
        label="Con qué lo pagaron"
        value={methodId}
        onChange={setMethodId}
        options={[
          { value: '', k: 'Efectivo o transferencia', mark: <Banknote /> },
          ...methods.map((candidate) => ({
            value: candidate.id,
            k: candidate.name,
            ...(candidate.kind === 'efectivo'
              ? {}
              : { v: kindOf(candidate.kind) }),
            mark: <CardBrandMark brand={candidate.brand} />,
          })),
        ]}
      />
      {/* "Fui a pagar y no llevé el total." Held shut rather than hidden
          when the figure typed is not less than what the bill asks for,
          so the question does not appear out of nowhere the moment
          somebody lowers it. Not offered at all on a bill with no figure
          (there is nothing to take a part off) or on credit (that money
          does not leave today). */}
      {left === null || onCredit ? null : (
        <Toggle
          k="Pagué solo una parte"
          v={
            partial
              ? `El servicio queda abierto debiendo ${pesos(stillOwed)}.`
              : canSplit
                ? `Marcalo y el servicio queda abierto debiendo ${pesos(left - moneyValue(amount))}.`
                : priced
                  ? 'Eso cubre todo lo que falta, así que el servicio queda pagado.'
                  : 'Poné cuánto pagaste y marcá esto si no llegaste al total.'
          }
          checked={partial}
          disabled={!canSplit}
          onChange={setOnlyPart}
        />
      )}
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
