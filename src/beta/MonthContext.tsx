import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { currentMonthRange } from '@/lib/expenses'

type MonthValue = {
  readonly monthStart: Date
  readonly monthEnd: Date
  readonly step: (months: number) => void
}

const MonthContext = createContext<MonthValue | null>(null)

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
    return {
      monthStart,
      monthEnd,
      step: (months) => {
        setAnchor(
          (current) =>
            new Date(current.getFullYear(), current.getMonth() + months, 1),
        )
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
