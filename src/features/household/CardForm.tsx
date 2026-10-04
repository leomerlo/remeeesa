import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { AlertMessage } from '@/components/ui/alert-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  CARD_BRANDS,
  PAYMENT_METHOD_KINDS,
  parseCardBrand,
  parsePaymentMethodKind,
} from '@/lib/cards'
import type { Card, CardBrand, PaymentMethodKind } from '@/lib/cards'
import { parseCardCurrency } from '@/lib/money'
import type { CardCurrency } from '@/lib/money'

// Said in words, not in symbols: "$ y US$" in a dropdown is a puzzle, and
// what the setting actually decides is whether this card can hold a dollar
// consumo at all. Per direct feedback.
export const CARD_CURRENCY_OPTIONS: readonly {
  readonly value: CardCurrency
  readonly label: string
}[] = [
  { value: 'ARS', label: 'Pesos' },
  { value: 'USD', label: 'Dólares' },
  { value: 'BOTH', label: 'Pesos y dólares' },
]

// "Pesos y dólares" is one card the bank settles as two resúmenes, which
// only a credit card does. Cash in dollars and cash in pesos are two
// different piles of money, so they are two methods -- per direct feedback,
// the dollars you take on a trip are their own thing.
export function currencyOptionsFor(
  kind: PaymentMethodKind,
): readonly { readonly value: CardCurrency; readonly label: string }[] {
  return kind === 'credito'
    ? CARD_CURRENCY_OPTIONS
    : CARD_CURRENCY_OPTIONS.filter((option) => option.value !== 'BOTH')
}

export type CardFormProps = {
  // The card being edited, or undefined when one is being created.
  readonly card?: Card
  readonly pending: boolean
  readonly error: string | null
  readonly onSubmit: (input: {
    readonly name: string
    readonly kind: PaymentMethodKind
    readonly currency: CardCurrency
    readonly brand: CardBrand
  }) => void
}

// One form for adding a card and for editing one: the two used to be an
// inline row with three loose controls and a bare "Nombre de la tarjeta"
// field at the bottom of a list. Everything a card is -- what it is called,
// which card it is, and what it can be billed in -- is decided here, and one
// "Guardar" writes all of it. Per direct feedback.
export function CardForm({
  card,
  pending,
  error,
  onSubmit,
}: CardFormProps): ReactElement {
  const [name, setName] = useState(card?.name ?? '')
  const [kind, setKind] = useState<PaymentMethodKind>(card?.kind ?? 'credito')
  const [currency, setCurrency] = useState<CardCurrency>(
    card?.currency ?? 'ARS',
  )
  const [brand, setBrand] = useState<CardBrand>(card?.brand ?? 'otra')
  const currencyOptions = currencyOptionsFor(kind)
  // A method that stops being a credit card cannot stay "pesos y dólares",
  // so the field falls back to pesos rather than submitting a value its own
  // dropdown no longer offers.
  const effectiveCurrency = currencyOptions.some(
    (option) => option.value === currency,
  )
    ? currency
    : 'ARS'

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    onSubmit({ name, kind, currency: effectiveCurrency, brand })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex h-full min-h-0 flex-col gap-6 overflow-x-hidden overflow-y-auto overscroll-contain"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="card-name">Nombre</Label>
        <Input
          id="card-name"
          value={name}
          disabled={pending}
          autoFocus
          placeholder="Visa Flor"
          onChange={(event) => {
            setName(event.target.value)
          }}
        />
        <p className="text-muted-foreground text-xs">
          Como la llamás vos. Es el nombre que van a llevar sus resúmenes.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="card-kind">Tipo</Label>
        <Select
          id="card-kind"
          value={kind}
          disabled={pending}
          onChange={(event) => {
            setKind(parsePaymentMethodKind(event.target.value))
          }}
        >
          {PAYMENT_METHOD_KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        {/* What picking it means for the month, said here rather than
            learned by watching the budget move. */}
        <p className="text-muted-foreground text-xs">
          {PAYMENT_METHOD_KINDS.find((option) => option.value === kind)?.detail}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="card-brand">Marca</Label>
        <Select
          id="card-brand"
          value={brand}
          disabled={pending}
          onChange={(event) => {
            setBrand(parseCardBrand(event.target.value))
          }}
        >
          {CARD_BRANDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="card-currency">Moneda</Label>
        <Select
          id="card-currency"
          value={effectiveCurrency}
          disabled={pending}
          onChange={(event) => {
            setCurrency(parseCardCurrency(event.target.value))
          }}
        >
          {currencyOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <p className="text-muted-foreground text-xs">
          {kind === 'credito'
            ? '«Pesos y dólares» es la tarjeta que el banco te factura en las dos: lleva un resumen por moneda y el de dólares no toca el presupuesto.'
            : 'Lo que cargues con este método va a estar en esta moneda. Los gastos en dólares se registran pero no se descuentan del presupuesto.'}
        </p>
      </div>

      {error !== null ? <AlertMessage>{error}</AlertMessage> : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending
          ? 'Guardando…'
          : card === undefined
            ? 'Agregar método'
            : 'Guardar'}
      </Button>
    </form>
  )
}
