import { ArrowDownUp, Check, Pencil, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input'
import { arsToUsd, fetchDolarBlueRate, usdToArs } from '@/lib/dolarBlue'
import {
  clearDolarBlueOverride,
  readDolarBlueOverride,
  writeDolarBlueOverride,
} from '@/lib/dolarBlueOverride'

const USD = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// Pesos to dollars at the blue rate, or the other way round. A quick-reference tool for the
// sidebar; nothing here is saved.
export function DolarConverter(): ReactElement {
  const [value, setValue] = useState('')
  const [reversed, setReversed] = useState(false)
  // The rate the household was actually given, when it is not the published
  // one. Null means "use whatever the market says". Per direct feedback: a
  // quote from dolarapi is a starting point, not the figure the cueva paid.
  const [override, setOverride] = useState<number | null>(() =>
    readDolarBlueOverride(),
  )
  const [editingRate, setEditingRate] = useState<string | null>(null)
  const rate = useQuery({
    queryKey: ['dolar-blue'],
    queryFn: fetchDolarBlueRate,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  const amount = Number(value)
  // The override wins whenever there is one, including while the fetch is
  // still in flight or has failed -- a rate someone typed is a rate, and
  // "Cotización no disponible" beside a number they entered would be a lie.
  const rateInUse = override ?? rate.data

  function saveRate(): void {
    const parsed = Number(editingRate)
    if (Number.isFinite(parsed) && parsed > 0) {
      writeDolarBlueOverride(parsed)
      setOverride(parsed)
    }
    setEditingRate(null)
  }

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
        {rateInUse === undefined
          ? rate.isError
            ? 'Cotización no disponible'
            : 'Cargando cotización…'
          : value === ''
            ? `${override === null ? 'Dólar blue' : 'Tu cotización'}: $${USD.format(rateInUse)}`
            : reversed
              ? `≈ $ ${USD.format(usdToArs(amount, rateInUse))}`
              : `≈ US$ ${USD.format(arsToUsd(amount, rateInUse))}`}
      </p>
      {/* Editing the rate itself, not the amount being converted. Tucked
          under the figure it changes, and only ever one line tall. */}
      {editingRate === null ? (
        // Stacked, not side by side: the sidebar column leaves these about
        // 100px each, and both labels wrapped mid-phrase.
        <div className="flex flex-col items-start gap-1 text-xs">
          <button
            type="button"
            className="text-nav-foreground hover:text-nav-foreground-active focus-visible:ring-ring/50 flex items-center gap-1 rounded-sm font-medium underline underline-offset-2 outline-none focus-visible:ring-3"
            onClick={() => {
              setEditingRate(rateInUse === undefined ? '' : String(rateInUse))
            }}
          >
            <Pencil aria-hidden="true" className="size-3" />
            Editar cotización
          </button>
          {override === null ? null : (
            <button
              type="button"
              className="text-nav-foreground hover:text-nav-foreground-active focus-visible:ring-ring/50 rounded-sm underline underline-offset-2 outline-none focus-visible:ring-3"
              onClick={() => {
                clearDolarBlueOverride()
                setOverride(null)
              }}
            >
              Usar la del mercado
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <FormattedAmountInput
            aria-label="Cotización del dólar blue"
            autoFocus
            className="text-nav-foreground-active border-white/20 placeholder:text-nav-foreground"
            value={editingRate}
            onChange={setEditingRate}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                saveRate()
              }
              if (event.key === 'Escape') {
                setEditingRate(null)
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Guardar cotización"
            className="text-nav-foreground hover:bg-white/8 hover:text-nav-foreground-active"
            onClick={saveRate}
          >
            <Check />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Cancelar"
            className="text-nav-foreground hover:bg-white/8 hover:text-nav-foreground-active"
            onClick={() => {
              setEditingRate(null)
            }}
          >
            <X />
          </Button>
        </div>
      )}
    </div>
  )
}
