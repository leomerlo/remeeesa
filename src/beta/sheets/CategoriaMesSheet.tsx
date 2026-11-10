import { Check, CreditCard, Clock, X } from 'lucide-react'
import type { ReactElement } from 'react'
import { Sheet } from '../Sheet'
import { CategoryTile } from '../Tile'
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
  consumo: 'Con tarjeta',
}

export function CategoriaMesSheet({
  open,
  onClose,
  name,
  color,
  monthStart,
  movements,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly name: string
  readonly color: string
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
      <div className="sec">
        {movements.length === 0 ? (
          <p className="sub">
            No hay movimientos de {name} en {monthName(monthStart)}.
          </p>
        ) : (
          movements.map((move) => (
            <div className="card row" key={`${move.kind}-${move.id}`}>
              <CategoryTile name={name} color={color} />
              <span className="name">{move.name}</span>
              <span className="amt">
                {formatAmount(move.amount, move.currency)}
              </span>
              <span className="cat">
                {move.date.getDate()} de {monthName(move.date)}
              </span>
              <div className="tags">
                <span
                  className={
                    move.kind === 'gasto'
                      ? 'tag ok'
                      : move.kind === 'cuenta'
                        ? 'tag due'
                        : 'tag next'
                  }
                >
                  {move.kind === 'gasto' ? (
                    <Check />
                  ) : move.kind === 'cuenta' ? (
                    <Clock />
                  ) : (
                    <CreditCard />
                  )}
                  {WHAT[move.kind]}
                </span>
                {move.cuota === undefined ? null : (
                  <span className="tag soft">Cuota {move.cuota}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Sheet>
  )
}
