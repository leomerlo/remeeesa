import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { currentMonthRange } from '@/lib/expenses'

type MonthValue = {
  readonly monthStart: Date
  readonly monthEnd: Date
  readonly step: (months: number) => void
  // Already on the month we are living in. There is nothing after it.
  readonly atLatest: boolean
}

const MonthContext = createContext<MonthValue | null>(null)

function startOfThisMonth(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

// One viewed month for the whole app: stepping it on Gastos and then going
// to Servicios should not land you back in today.
export function MonthProvider({
  children,
}: {
  readonly children: ReactNode
}): ReactElement {
  const [anchor, setAnchor] = useState(() => new Date())
  const value = useMemo<MonthValue>(() => {
    const { monthStart, monthEnd } = currentMonthRange(anchor)
    const thisMonth = startOfThisMonth()
    return {
      monthStart,
      monthEnd,
      atLatest: monthStart.getTime() >= thisMonth.getTime(),
      // It does not go past the month we are in. Every screen it feeds is
      // a record of what happened, and a month that has not started has
      // none: Inicio showed "lleva gastado este mes" over the current
      // month's figure while standing in the next one, and what was still
      // owed here read as "quedó sin pagar" there. The month ahead has a
      // screen of its own -- Proyección, which pages its own month and is
      // honest about being a guess.
      step: (months) => {
        setAnchor((current) => {
          const next = new Date(
            current.getFullYear(),
            current.getMonth() + months,
            1,
          )
          return next.getTime() > startOfThisMonth().getTime() ? current : next
        })
      },
    }
  }, [anchor])

  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>
}

export function useMonth(): MonthValue {
  const value = useContext(MonthContext)
  if (value === null) {
    throw new Error('useMonth must be used inside MonthProvider')
  }
  return value
}
