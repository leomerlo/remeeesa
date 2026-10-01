import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input'
import { arsToUsd, fetchDolarBlueRate } from '@/lib/dolarBlue'

const USD = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// Pesos in, dollars out at the blue rate. A quick-reference tool for the
// sidebar; nothing here is saved.
export function DolarConverter(): ReactElement {
  const [ars, setArs] = useState('')
  const rate = useQuery({
    queryKey: ['dolar-blue'],
    queryFn: fetchDolarBlueRate,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  const amount = Number(ars)

  return (
    <div className="border-border mt-auto flex flex-col gap-2 border-t pt-4">
      <label htmlFor="dolar-ars" className="text-sm font-medium">
        Pesos a dólar blue
      </label>
      <FormattedAmountInput
        id="dolar-ars"
        placeholder="ARS"
        value={ars}
        onChange={setArs}
      />
      <p className="text-muted-foreground text-xs" aria-live="polite">
        {rate.isError
          ? 'Cotización no disponible'
          : rate.data === undefined
            ? 'Cargando cotización…'
            : ars === ''
              ? `Dólar blue: $${USD.format(rate.data)}`
              : `≈ US$ ${USD.format(arsToUsd(amount, rate.data))}`}
      </p>
    </div>
  )
}
