import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Pencil } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { fetchDolarBlueRate, usdToArs } from '@/lib/dolarBlue'
import {
  clearDolarBlueOverride,
  readDolarBlueOverride,
  writeDolarBlueOverride,
} from '@/lib/dolarBlueOverride'
import { digitsOf, formatPesos, parseTyped } from './format'

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
  const [usd, setUsd] = useState('100')

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
      <div className="pair">
        <input
          value={usd}
          inputMode="decimal"
          aria-label="Dólares"
          onChange={(event) => setUsd(event.target.value)}
        />
        <span className="swap" aria-hidden="true">
          <ArrowLeftRight />
        </span>
        <input
          value={
            rate === null
              ? ''
              : formatPesos(Math.round(usdToArs(parseTyped(usd), rate)))
          }
          inputMode="numeric"
          aria-label="Pesos"
          readOnly
        />
      </div>
    </div>
  )
}
