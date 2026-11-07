import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactElement } from 'react'
import { useMonth } from './MonthContext'
import { MONTHS } from './format'

// The app's viewed month, or a month of its own.
//
// Proyecciones is the one screen that pages something else: it is about a
// month nobody is in yet, so stepping it must not drag Inicio and Gastos
// forward with it.
export function MonthPager({
  month,
  onStep,
}: {
  readonly month?: Date
  readonly onStep?: (months: number) => void
} = {}): ReactElement {
  const viewed = useMonth()
  const monthStart = month ?? viewed.monthStart
  const step = onStep ?? viewed.step
  const name = MONTHS[monthStart.getMonth()] ?? ''

  return (
    <div className="month">
      <button type="button" aria-label="Mes anterior" onClick={() => step(-1)}>
        <ChevronLeft />
      </button>
      <b>{name.charAt(0).toUpperCase() + name.slice(1)}</b>
      <button type="button" aria-label="Mes siguiente" onClick={() => step(1)}>
        <ChevronRight />
      </button>
    </div>
  )
}
