import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactElement } from 'react'
import { useMonth } from './MonthContext'
import { MONTHS } from './format'

export function MonthPager(): ReactElement {
  const { monthStart, step } = useMonth()
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
