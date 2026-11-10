import type { CardCurrency } from '@/lib/money'
import type { PaymentMethodKind } from './types'

export function parseCardName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('Ingresá un nombre para la tarjeta')
  }
  return trimmed
}

// Only a credit card can be billed in both currencies: that is one card the
// bank settles as two separate resúmenes. Cash, a balance or a debit card is
// money in one currency -- dollars in hand and pesos in hand are two
// different things to keep track of, so they are two methods.
export function parseCardCurrencyFor(input: {
  readonly kind: PaymentMethodKind
  readonly currency: CardCurrency
}): CardCurrency {
  if (input.currency === 'BOTH' && input.kind !== 'credito') {
    throw new Error('Solo una tarjeta de crédito puede ser en pesos y dólares')
  }
  return input.currency
}
