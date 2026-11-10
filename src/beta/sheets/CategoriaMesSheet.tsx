import { X } from 'lucide-react'
import type { ReactElement } from 'react'
import { Sheet } from '../Sheet'
import { formatAmount, monthName } from '../format'
import type { Movement } from '../figures'

// What a slice of the ring is made of.
//
// Tapping a category on Inicio opens its month: every movement behind
// that figure, so the number can be checked rather than believed. The
// rows come from categoryMovements, which is built from the same three
// lists the slice itself is, so what is listed here always adds up to
// what is drawn there.
const WHAT: Readonly<Record<Movement['kind'], string>> = {
  gasto: 'Pagado',
  cuenta: 'Por pagar',
  // Still unpaid, but nobody is going to pay it: the bank takes it from
  // the card on the day. "Por pagar" reads as a chore that is yours.
  // The row says which card, so this is only the fallback.
  tarjeta: 'La paga la tarjeta',
  consumo: 'Con tarjeta',
}

export function CategoriaMesSheet({
  open,
  onClose,
  name,
  monthStart,
  movements,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly name: string
  readonly monthStart: Date
  readonly movements: readonly Movement[]
}): ReactElement | null {
  return (
    <Sheet
      title={`${name} en ${monthName(monthStart)}`}
      open={open}
      onClose={onClose}
      footer={
        <div className="sheet-acts">
          <button
            className="btn btn-secondary btn-block"
            type="button"
            onClick={onClose}
          >
            <X />
            Cerrar
          </button>
        </div>
      }
    >
      <div className="movs">
        {movements.length === 0 ? (
          <p className="sub">
            No hay movimientos de {name} en {monthName(monthStart)}.
          </p>
        ) : (
          movements.map((move) => (
            <div className="movrow" key={`${move.kind}-${move.id}`}>
              <span className="nm">{move.name}</span>
              <span className="amt">
                {formatAmount(move.amount, move.currency)}
              </span>
              <span className="when">
                {move.date.getDate()} de {monthName(move.date)}
                {move.cuota === undefined ? '' : ` · cuota ${move.cuota}`}
              </span>
              <span
                className={
                  move.kind === 'gasto'
                    ? 'tag ok'
                    : move.kind === 'cuenta'
                      ? 'tag due'
                      : 'tag next'
                }
              >
                {move.paidBy ?? WHAT[move.kind]}
              </span>
            </div>
          ))
        )}
      </div>
    </Sheet>
  )
}
