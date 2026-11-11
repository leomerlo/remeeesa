import { Banknote, Check, Undo2 } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import type { Card as PaymentMethod } from '@/lib/cards'
import { markPendientePaidWithCard } from '@/lib/cards'
import type { Category } from '@/lib/expenses'
import { findOrCreateCategory, updateExpense } from '@/lib/expenses'
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
  setPendienteRecurrence,
  undoLastPartialPayment,
  unmarkPendientePaid,
  updatePendiente,
} from '@/lib/pendientes'
import { CardBrandMark } from '../CardBrandMark'
import { DangerAction, Sheet, SheetFoot } from '../Sheet'
import { useSave } from '../useSave'
import type { BetaSession } from '../data'
import {
  CategoryField,
  DateField,
  MoneyField,
  MoneyRow,
  PickField,
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
  // A category nobody has yet, named here rather than created here --
  // the same way anotar un gasto takes it, resolved by the save.
  const [categoryName, setCategoryName] = useState('')
  // The same question the gasto form asks, so a servicio marcado mal can
  // be put right from the form that got it wrong. On a bill still owed,
  // saying yes pays it; on one already paid, saying no undoes it.
  const [paid, setPaid] = useState(bill?.status === 'paid')
  const [due, setDue] = useState(isoDay(bill?.dueDate ?? today))
  const [recurring, setRecurring] = useState(bill?.recurring ?? true)
  const [autoDebit, setAutoDebit] = useState(bill?.autoDebit ?? false)
  // '' is cash, the method every household has without creating one.
  const [methodId, setMethodId] = useState(bill?.paymentMethodId ?? '')
  const save = useSave(onClose)

  const named = name.trim() !== ''
  // Blank is allowed; a number that is not a number is not.
  const priced = moneyIsValid(amount, { required: false })
  const blocked =
    !named || !priced || (categoryId === '' && categoryName.trim() === '')
  const householdId = session.householdId ?? ''
  // The only reason a form here refuses to save: the household has not
  // finished loading, so there is nowhere to write yet.
  const locked: string | null =
    householdId === ''
      ? 'Todavía estamos leyendo el hogar. Probá de nuevo en un segundo.'
      : null

  const onSave = (): void => {
    save.run(async () => {
      const expectedAmount = amount.trim() === '' ? null : moneyValue(amount)
      const dueDate = dayFromIso(due)
      // A name typed into the category box becomes a category here and
      // nowhere earlier, exactly as anotar un gasto does it: one lookup,
      // before anything is written, so abandoning the form leaves none.
      const resolved =
        categoryName.trim() === ''
          ? categoryId
          : (
              await findOrCreateCategory({
                db: session.db,
                householdId,
                name: categoryName.trim(),
              })
            ).id
      if (bill === null) {
        return createPendiente({
          db: session.db,
          householdId,
          categoryId: resolved,
          name: name.trim(),
          dueDate,
          expectedAmount,
          recurring,
          autoDebit,
          paymentMethodId: methodId === '' ? null : methodId,
          currency,
        })
      }

      // A paid bill is frozen: firestore.rules refuses every field on one
      // except through two narrow doors, because what it says is the
      // record of something that already happened. So the order matters.
      //
      // Undoing the payment comes first, and once it is undone the bill
      // is open again and everything else on this form can be written --
      // which is what makes "apagá Ya lo pagué y guardá" a way to correct
      // a payment rather than only a way to cancel one.
      const settled = bill.status === 'paid'
      if (settled && !paid) {
        await unmarkPendientePaid({
          db: session.db,
          householdId,
          pendienteId: bill.id,
        })
      }
      const frozen = settled && paid
      // The one answer a paid bill can still change, through its own door
      // (setPendienteRecurrence): whether it comes back next month is
      // still ahead of it, however settled this month's copy is.
      if (frozen) {
        if (bill.recurring !== recurring || bill.autoDebit !== autoDebit) {
          await setPendienteRecurrence({
            db: session.db,
            householdId,
            pendienteId: bill.id,
            recurring,
            autoDebit,
          })
        }
        // Recurrence is what decides where the payment is read: the gasto
        // it wrote carries the answer that was true at the time, and
        // nothing looks the bill up again. So when that answer changes,
        // the gasto has to be told -- otherwise a servicio turned into a
        // one-off stays off Gastos for ever.
        if (bill.recurring !== recurring && bill.paidExpenseId !== null) {
          await updateExpense({
            db: session.db,
            householdId,
            expenseId: bill.paidExpenseId,
            isService: recurring,
          })
        }
        return bill
      }

      const edited = await updatePendiente({
        db: session.db,
        householdId,
        pendienteId: bill.id,
        categoryId: resolved,
        name: name.trim(),
        dueDate,
        expectedAmount,
        recurring,
        autoDebit,
        paymentMethodId: methodId === '' ? null : methodId,
        currency,
      })
      if (settled || !paid) return edited
      // Said to be paid, and it was not: settle it for what the form
      // says, today. The row's own "Ya lo pagué" asks more -- the date,
      // the method, whether it was only a part -- and is still there.
      if (expectedAmount === null) return edited
      return markPendientePaid({
        db: session.db,
        householdId,
        pendienteId: bill.id,
        memberId: session.userId ?? '',
        authorDisplayName: session.displayName ?? 'Alguien',
        finalAmount: expectedAmount,
        paymentDate: today,
        paymentMethodId: methodId === '' ? null : methodId,
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
      <CategoryField
        label="Categoría"
        value={categoryId}
        newName={categoryName}
        onPick={setCategoryId}
        onName={setCategoryName}
        categories={categories}
      />
      <DateField label="Vence el" value={due} onChange={setDue} />
      {/* The same first question anotar un gasto asks, so the two forms
          ask the same things in the same order -- and so a servicio can
          be settled, or a payment undone, from the form that holds
          everything else about it. Not offered on a brand new one: an
          alta that is already paid is a gasto, and that is the other
          form. */}
      {bill === null ? null : (
        <Toggle
          k="Ya lo pagué"
          v={
            paid
              ? bill.status === 'paid'
                ? 'Está pagado. Si lo apagás, vuelve a lo que falta pagar y se borra el gasto que anotó.'
                : `Se marca pagado hoy, por ${pesos(amount.trim() === '' ? 0 : moneyValue(amount))}.`
              : 'Queda esperando en lo que falta pagar, con esa fecha de vencimiento.'
          }
          checked={paid}
          onChange={setPaid}
        />
      )}
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
          {/* Undoing it is the "Ya lo pagué" switch above, which is the
              same question the gasto form asks. It used to be a button of
              its own down here, which left two ways to do one thing. What
              that button explained is worth keeping, so it stays as the
              note it always was -- with what a paid servicio will not let
              anybody change, which the form used to simply refuse to save
              without saying why. */}
          <p className="fnote">
            Mientras esté pagado, lo único que se puede cambiar es si vuelve
            todos los meses. El nombre, el monto, la fecha y la categoría
            quedan como quedaron: son el registro de algo que ya pasó.
          </p>
          <p className="fnote">
            Para corregir cualquiera de esos, o para deshacer el pago, apagá
            «Ya lo pagué» y guardá: vuelve a lo que falta pagar, se saca el
            gasto que ese pago había anotado, y ahí sí podés editarlo. Si lo
            pagaron con tarjeta, también sale el consumo del resumen.
          </p>
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
