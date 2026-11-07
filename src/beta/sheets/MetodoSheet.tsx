import { useState } from 'react'
import type { ReactElement } from 'react'
import type {
  Card as PaymentMethod,
  CardBrand,
  PaymentMethodKind,
} from '@/lib/cards'
import { createCard, deleteCard, updateCard } from '@/lib/cards'
import type { CardCurrency } from '@/lib/money'
import { CardBrandMark } from '../CardBrandMark'
import { DangerAction, Sheet, SheetFoot } from '../Sheet'
import { NOT_MINE_NOTE } from '../sandboxDb'
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

  const trimmed = name.trim()
  const named = trimmed !== ''
  const taken = existing.some(
    (other) =>
      other.id !== method?.id &&
      other.name.trim().toLowerCase() === trimmed.toLowerCase(),
  )
  const blocked = !named || taken
  const save = useSave(onClose)
  const householdId = session.householdId ?? ''
  const locked: string | null =
    method !== null && !session.sandbox.owns('card', method.id)
      ? NOT_MINE_NOTE
      : householdId === ''
        ? 'Todavía estamos leyendo el hogar. Probá de nuevo en un segundo.'
        : null

  const onSave = (): void => {
    save.run(() => {
      if (method !== null) {
        return updateCard({
          db: session.db,
          householdId,
          cardId: method.id,
          name: trimmed,
          kind,
          currency,
          brand,
        })
      }
      return createCard({
        db: session.db,
        householdId,
        name: trimmed,
        kind,
        currency,
        brand,
      })
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
