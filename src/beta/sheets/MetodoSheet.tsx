import { useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type {
  Card as PaymentMethod,
  CardBrand,
  PaymentMethodKind,
} from '@/lib/cards'
import {
  closingDayFor,
  closingMonthKey,
  createCard,
  deleteCard,
  setCardClosingDay,
  updateCard,
} from '@/lib/cards'
import type { CardCurrency } from '@/lib/money'
import { CardBrandMark } from '../CardBrandMark'
import { DangerAction, Sheet, SheetFoot } from '../Sheet'
import { useSave } from '../useSave'
import type { BetaSession } from '../data'
import { OptionList, SelectField, TextField } from '../fields'

const BRANDS: readonly { readonly value: CardBrand; readonly label: string }[] =
  [
    { value: 'visa', label: 'Visa' },
    { value: 'mastercard', label: 'Mastercard' },
    { value: 'amex', label: 'American Express' },
    { value: 'mercadopago', label: 'Mercado Pago' },
    { value: 'otra', label: 'Otra' },
  ]

// Adding and editing a way of paying.
//
// Only one of the four kinds changes what the app does with the money:
// credit. The other three are names for money that has already gone, so
// the list says that out loud instead of leaving it to be discovered.
export function MetodoSheet({
  open,
  onClose,
  session,
  method,
  existing,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly session: BetaSession
  readonly method: PaymentMethod | null
  readonly existing: readonly PaymentMethod[]
}): ReactElement {
  const [name, setName] = useState(method?.name ?? '')
  const [kind, setKind] = useState<PaymentMethodKind>(method?.kind ?? 'credito')
  const [brand, setBrand] = useState<CardBrand>(method?.brand ?? 'visa')
  const [currency, setCurrency] = useState<CardCurrency>(
    method?.currency ?? 'ARS',
  )
  // The cierre in force this month, which is the one the household is
  // looking at. '' is "todavía no sé", which leaves the card placing its
  // purchases the way it always did.
  const thisMonth = closingMonthKey(new Date())
  const [closingDay, setClosingDay] = useState(() => {
    const day =
      method === null ? null : closingDayFor(method.closings, thisMonth)
    return day === null ? '' : String(day)
  })
  // What setting it moved, shown instead of closing: a consumo changing
  // Resumen is the household's money moving month, and it should not
  // happen behind their back.
  const [moved, setMoved] = useState<{
    readonly moved: number
    readonly locked: number
  } | null>(null)
  // Read by the save's own callback, which closes the sheet: a piece of
  // state would still be the old one by the time it runs.
  const reported = useRef(false)

  const trimmed = name.trim()
  const named = trimmed !== ''
  const taken = existing.some(
    (other) =>
      other.id !== method?.id &&
      other.name.trim().toLowerCase() === trimmed.toLowerCase(),
  )
  const blocked = !named || taken
  const save = useSave(() => {
    // Something moved month: the sheet stays open to say so, and the
    // household closes it once they have read it.
    if (!reported.current) onClose()
  })
  const householdId = session.householdId ?? ''
  // The only reason a form here refuses to save: the household has not
  // finished loading, so there is nowhere to write yet.
  const locked: string | null =
    householdId === ''
      ? 'Todavía estamos leyendo el hogar. Probá de nuevo en un segundo.'
      : null

  // The cierre is saved apart from the rest, through its own call: it does
  // more than write a day -- it moves whatever that day leaves on the
  // wrong side of the cierre into the next Resumen.
  const saveClosing = async (cardId: string): Promise<void> => {
    if (kind !== 'credito' || closingDay === '') return
    const was =
      method === null ? null : closingDayFor(method.closings, thisMonth)
    if (was === Number(closingDay)) return
    const result = await setCardClosingDay({
      db: session.db,
      householdId,
      cardId,
      day: Number(closingDay),
    })
    if (result.moved.length > 0 || result.locked.length > 0) {
      reported.current = true
      setMoved({
        moved: result.moved.length,
        locked: result.locked.length,
      })
    }
  }

  const onSave = (): void => {
    save.run(async () => {
      if (method !== null) {
        const edited = await updateCard({
          db: session.db,
          householdId,
          cardId: method.id,
          name: trimmed,
          kind,
          currency,
          brand,
        })
        await saveClosing(method.id)
        return edited
      }
      const created = await createCard({
        db: session.db,
        householdId,
        name: trimmed,
        kind,
        currency,
        brand,
      })
      await saveClosing(created.id)
      return created
    })
  }

  return (
    <Sheet
      title={method === null ? 'Agregar una tarjeta' : 'Editar la tarjeta'}
      open={open}
      onClose={onClose}
      footer={
        <SheetFoot
          label={method === null ? 'Agregar' : 'Guardar'}
          saving={save.saving}
          blocked={blocked}
          locked={locked}
          failed={save.failed}
          onSave={onSave}
        />
      }
    >
      <div className="catpreview">
        <span className="tile cardface" aria-hidden="true">
          <CardBrandMark brand={brand} />
        </span>
        <span className="k">{trimmed === '' ? 'Sin nombre' : trimmed}</span>
        <span className="v">
          {kind === 'credito'
            ? 'Lo que paguen con ella llega en el resumen'
            : 'Lo que paguen con ella sale en el momento'}
        </span>
      </div>
      <TextField
        label="Cómo la llaman"
        value={name}
        onChange={setName}
        placeholder="Visa Leo, Master del banco…"
        hint="El nombre es para ustedes: es el que van a ver al elegir con qué pagaron."
      />
      <OptionList
        label="Qué hace con la plata"
        value={kind}
        onChange={setKind}
        options={[
          {
            value: 'credito',
            k: 'Tarjeta de crédito',
            v: 'No sale en el momento: llega en el resumen del mes que viene',
          },
          {
            value: 'debito',
            k: 'Tarjeta de débito',
            v: 'Sale en el momento, de la cuenta',
          },
          {
            value: 'cuenta',
            k: 'Transferencia o cuenta',
            v: 'Sale en el momento',
          },
          { value: 'efectivo', k: 'Efectivo', v: 'Sale en el momento' },
        ]}
      />
      <SelectField
        label="Marca"
        value={brand}
        onChange={(next) => setBrand(next as CardBrand)}
        options={BRANDS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        hint="Solo para reconocerla de un vistazo. No cambia ninguna cuenta."
      />
      <SelectField
        label="En qué moneda"
        value={currency}
        onChange={(next) => setCurrency(next as CardCurrency)}
        options={[
          { value: 'ARS', label: 'Pesos' },
          { value: 'USD', label: 'Dólares' },
          { value: 'BOTH', label: 'Pesos y dólares' },
        ]}
        hint={
          currency === 'BOTH'
            ? 'Va a tener dos resúmenes por mes, uno por moneda: los dos totales no se pueden sumar.'
            : undefined
        }
      />
      {kind === 'credito' ? (
        <SelectField
          label="Qué día cierra el resumen"
          value={closingDay}
          onChange={setClosingDay}
          options={[
            { value: '', label: 'Todavía no sé' },
            ...Array.from({ length: 28 }, (_, index) => ({
              value: String(index + 1),
              label: `El ${String(index + 1)}`,
            })),
          ]}
          hint="Lo que compren ese día o después entra en el resumen siguiente. Queda puesto para los meses que vienen; si un mes cierra otro día, lo cambiás acá."
        />
      ) : null}
      {moved === null ? null : (
        <p className="fnote" role="status">
          {moved.moved === 0
            ? null
            : moved.moved === 1
              ? 'Se movió 1 consumo al resumen siguiente. '
              : `Se movieron ${String(moved.moved)} consumos al resumen siguiente. `}
          {moved.locked === 0
            ? null
            : moved.locked === 1
              ? 'Hay 1 que no se pudo mover porque su resumen ya está pagado.'
              : `Hay ${String(moved.locked)} que no se pudieron mover porque su resumen ya está pagado.`}
        </p>
      )}
      {blocked ? (
        <p className="fproblem" role="alert">
          {!named
            ? 'Falta el nombre.'
            : 'Ya hay una tarjeta con ese nombre: si son dos distintas, diferencialas.'}
        </p>
      ) : null}
      {method === null ? null : (
        <DangerAction
          label="Borrar esta tarjeta"
          saving={save.saving}
          locked={locked}
          onPress={() => {
            save.run(() =>
              deleteCard({
                db: session.db,
                householdId,
                cardId: method.id,
              }),
            )
          }}
        />
      )}
    </Sheet>
  )
}
