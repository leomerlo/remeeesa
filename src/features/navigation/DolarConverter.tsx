import { ArrowDownUp } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input'
import { arsToUsd, fetchDolarBlueRate, usdToArs } from '@/lib/dolarBlue'

const USD = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// Pesos to dollars at the blue rate, or the other way round. A quick-reference tool for the
// sidebar; nothing here is saved.
export function DolarConverter(): ReactElement {
  const [value, setValue] = useState('')
  const [reversed, setReversed] = useState(false)
  const rate = useQuery({
    queryKey: ['dolar-blue'],
    queryFn: fetchDolarBlueRate,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  const amount = Number(value)

  return (
    // It lives inside the dark nav, so it cannot inherit the page's own
    // border and muted colours -- a hairline meant for a white card is
    // invisible here, and muted grey text on near-black is unreadable.
    <div className="mt-auto flex flex-col gap-2 border-t border-white/15 pt-4">
      <div className="flex items-center justify-between">
        <label htmlFor="dolar-input" className="text-sm font-medium">
          {reversed ? 'Dólar blue a pesos' : 'Pesos a dólar blue'}
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-nav-foreground hover:bg-white/8 hover:text-nav-foreground-active"
          aria-label="Invertir conversión"
          onClick={() => {
            setReversed(!reversed)
            setValue('')
          }}
        >
          <ArrowDownUp />
        </Button>
      </div>
      <FormattedAmountInput
        id="dolar-input"
        className="text-nav-foreground-active border-white/20 placeholder:text-nav-foreground"
        placeholder={reversed ? 'USD' : 'ARS'}
        value={value}
        onChange={setValue}
      />
      <p className="text-nav-foreground text-xs" aria-live="polite">
        {rate.isError
          ? 'Cotización no disponible'
          : rate.data === undefined
            ? 'Cargando cotización…'
            : value === ''
              ? `Dólar blue: $${USD.format(rate.data)}`
              : reversed
                ? `≈ $ ${USD.format(usdToArs(amount, rate.data))}`
                : `≈ US$ ${USD.format(arsToUsd(amount, rate.data))}`}
      </p>
    </div>
  )
}
