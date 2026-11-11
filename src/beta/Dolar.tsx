import { useQuery } from '@tanstack/react-query'
import { ArrowUpDown, Pencil } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { arsToUsd, fetchDolarBlueRate, usdToArs } from '@/lib/dolarBlue'
import {
  clearDolarBlueOverride,
  readDolarBlueOverride,
  writeDolarBlueOverride,
} from '@/lib/dolarBlueOverride'
import { parseStoredAmount } from '@/lib/money'
import { AmountInput } from './fields'
import { digitsOf, formatPesos } from './format'

// Carried over from the v1, where it also lives in the navigation: it is a
// tool you reach for, not part of any one screen. The rate is fetched and
// the household can type over it when the one it got is not the one they
// are actually buying at. That override is a browser preference, not
// household data -- it never goes near Firestore.
export function Dolar(): ReactElement {
  const [override, setOverride] = useState<number | null>(() =>
    readDolarBlueOverride(),
  )
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  // One side holds what was typed and the other is worked out from it, so
  // whichever box you are in is the one that keeps your digits. Typing in
  // the other simply moves which side that is.
  const [typed, setTyped] = useState<{
    readonly side: 'usd' | 'ars'
    readonly text: string
  }>({ side: 'usd', text: '100' })

  const fetched = useQuery({
    queryKey: ['beta', 'dolar'],
    queryFn: fetchDolarBlueRate,
    staleTime: 900_000,
  })
  const rate = override ?? fetched.data ?? null

  if (editing) {
    return (
      <div className="dolar">
        <div className="top">
          <span>Cotización del dólar blue</span>
        </div>
        {/* Separated as it is typed, like every other figure in the app:
            a rate is read in thousands, and "1555" takes longer to check
            than "1.555". Only the digits are ever kept, so a separator
            cannot become part of the value. */}
        <input
          value={formatPesos(digitsOf(draft))}
          inputMode="numeric"
          aria-label="Cotización del dólar blue"
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="acts">
          <button
            className="ok"
            type="button"
            onClick={() => {
              const parsed = digitsOf(draft)
              if (parsed > 0) {
                writeDolarBlueOverride(parsed)
                setOverride(parsed)
              }
              setEditing(false)
            }}
          >
            Guardar
          </button>
          <button
            className="no"
            type="button"
            onClick={() => setEditing(false)}
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  const sides = convert(typed, rate)

  return (
    <div className="dolar">
      <div className="top">
        <span>Dólar blue</span>
        <span className="rate">
          {rate === null ? '—' : `$${formatPesos(rate)}`}
        </span>
        <button
          className="edit"
          type="button"
          aria-label="Editar la cotización"
          onClick={() => {
            setDraft(rate === null ? '' : String(rate))
            setEditing(true)
          }}
        >
          <Pencil />
        </button>
      </div>
      {override === null ? null : (
        <div className="mine">
          La pusieron ustedes ·{' '}
          <button
            type="button"
            className="mine-reset"
            onClick={() => {
              clearDolarBlueOverride()
              setOverride(null)
            }}
          >
            volver a la de hoy
          </button>
        </div>
      )}
      {/* Both sides take a figure, and each says which money it is: the
          two boxes were identical and the conversion only ran one way, so
          whoever typed into them had to remember which was which and
          could only ever ask the question in one direction.

          The arrows between them are a picture of what is happening, not
          a button: there is nothing to press when both sides are live.

          One over the other, not side by side: the rail is 200px wide,
          and a box holding "US$" and "155.500" at once cut the figure
          off halfway through. */}
      <div className="pair">
        <label className="side">
          <span className="cur">US$</span>
          <AmountInput
            label="Dólares"
            value={sides.usd}
            onChange={(text) => setTyped({ side: 'usd', text })}
          />
        </label>
        <span className="swap" aria-hidden="true">
          <ArrowUpDown />
        </span>
        <label className="side">
          <span className="cur">$</span>
          <AmountInput
            label="Pesos"
            value={sides.ars}
            onChange={(text) => setTyped({ side: 'ars', text })}
          />
        </label>
      </div>
    </div>
  )
}

// What each box shows: the one that was typed in, verbatim, and the other
// worked out at the rate. Nothing is worked out without a rate, and
// nothing is worked out from an empty box -- a zero nobody typed reads
// like an answer.
//
// Pesos come out whole, because nobody converts to pesos and cares about
// the centavos; dollars come out to the cent, because at 1.555 a peso
// rounding them to whole dollars would throw away a thousand pesos.
export function convert(
  typed: { readonly side: 'usd' | 'ars'; readonly text: string },
  rate: number | null,
): { readonly usd: string; readonly ars: string } {
  const other =
    rate === null || rate <= 0 || typed.text.trim() === ''
      ? ''
      : typed.side === 'usd'
        ? String(Math.round(usdToArs(parseStoredAmount(typed.text), rate)))
        : String(
            Math.round(arsToUsd(parseStoredAmount(typed.text), rate) * 100) /
              100,
          )
  return typed.side === 'usd'
    ? { usd: typed.text, ars: other }
    : { usd: other, ars: typed.text }
}
