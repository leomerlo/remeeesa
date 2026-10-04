import type { ReactElement } from 'react'
import type { CardBrand } from '@/lib/cards'

export type CardBrandMarkProps = {
  readonly brand: CardBrand
  readonly className?: string
}

// The mark on a card's own card. Drawn here rather than imported: these are
// the shapes people recognise at a glance -- Mastercard's two circles, the
// others as their own wordmark -- in a size and a palette that belong to
// this app. Nobody has to read the name to know which card it is.
export function CardBrandMark({
  brand,
  className,
}: CardBrandMarkProps): ReactElement {
  if (brand === 'mastercard') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <circle cx="9.2" cy="12" r="6" fill="#eb001b" />
        <circle cx="14.8" cy="12" r="6" fill="#f79e1b" fillOpacity="0.85" />
      </svg>
    )
  }
  if (brand === 'visa') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fontSize="9"
          fontWeight="800"
          fontStyle="italic"
          fill="currentColor"
        >
          VISA
        </text>
      </svg>
    )
  }
  if (brand === 'amex') {
    // Wider box than the others: "AMEX" is four letters where "VISA" is
    // four narrower ones, and in a 24-unit square its own ends were clipped.
    return (
      <svg viewBox="0 0 34 24" className={className} aria-hidden="true">
        <text
          x="17"
          y="15.5"
          textAnchor="middle"
          fontSize="10"
          fontWeight="800"
          fill="currentColor"
        >
          AMEX
        </text>
      </svg>
    )
  }
  if (brand === 'mercadopago') {
    // Their blue with "MP" in it, not a trace of the artwork: enough to
    // recognise at a glance in a list, which is all any of these marks are
    // for.
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="#009ee3" />
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fontSize="9"
          fontWeight="800"
          fill="#ffffff"
        >
          MP
        </text>
      </svg>
    )
  }
  // "Otra": a plain card outline, which is what the app has always drawn
  // for a Resumen row.
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect
        x="2.5"
        y="5.5"
        width="19"
        height="13"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M2.5 10h19" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}
