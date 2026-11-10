import type { ReactElement } from 'react'
import type { Currency } from '@/lib/money'
import { formatAmount, formatCurrency } from './format'

// How much narrower a figure has to get before it fits the box it is in.
// Argentine amounts run long -- "$2.476.253,89" is fourteen characters and
// a million-peso month is ordinary, not an edge case -- so the step is
// decided by the number's own length rather than by the screen's width. A
// short figure keeps the full size it was designed at; a long one gives
// back exactly as much as it needs.
//
// Four steps rather than a continuous scale: three figures side by side in
// the row of small cards should land on the same few sizes, not on three
// slightly different ones.
function step(text: string): 0 | 1 | 2 | 3 {
  const length = text.length
  if (length <= 9) return 0
  if (length <= 12) return 1
  if (length <= 15) return 2
  return 3
}

export function Figure({
  amount,
  currency,
  className = '',
}: {
  readonly amount: number
  // Omitted for pesos, which is nearly every figure in the app.
  readonly currency?: Currency
  readonly className?: string
}): ReactElement {
  const text =
    currency === undefined || currency === 'ARS'
      ? formatCurrency(amount)
      : formatAmount(amount, currency)
  // Always a wrapper around the figure, never the figure itself: the step
  // is an em of the box the number sits in, so it needs that box to be its
  // parent. Collapsing the two made every long figure scale off the body
  // size instead -- 12px inside a card designed for 26.
  return (
    <span className={className === '' ? undefined : className}>
      <span className="fig" data-len={step(text)}>
        {text}
      </span>
    </span>
  )
}
