import type { ReactElement } from 'react'
import { Info } from 'lucide-react'

// A short, one-time-per-visit explainer for a distinction that isn't
// obvious from the two buttons alone: "Agregar gasto" and "Nuevo
// pendiente" sit side by side, and nothing else on Home says why there are
// two. Placed right under that row, where the choice is actually made,
// rather than buried in Ajustes where nobody would find it before needing
// it.
export function GastoVsPendienteHint(): ReactElement {
  return (
    <div
      role="note"
      className="bg-primary/10 flex w-full items-start gap-2.5 rounded-2xl p-3.5 text-sm"
    >
      <Info
        className="text-primary mt-0.5 size-4 shrink-0"
        aria-hidden="true"
      />
      <p className="text-foreground">
        <strong className="font-semibold">Gasto</strong> es lo que vas pagando
        en el momento, como cafecitos o compritas.{' '}
        <strong className="font-semibold">Pendiente</strong> son los servicios o
        pagos recurrentes que tenés que hacer mes a mes.
      </p>
    </div>
  )
}
