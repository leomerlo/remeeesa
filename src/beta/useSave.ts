import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

// What a form does when its button is pressed: run the write, refresh
// everything that was reading, close. One hook rather than one mutation per
// form, because every form wants the same three things -- a button that says
// it is working, a line that says what went wrong, and every screen showing
// the new figure afterwards.
export function useSave(onDone: () => void): {
  readonly saving: boolean
  readonly failed: string | null
  readonly run: (work: () => Promise<unknown>) => void
} {
  const client = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const run = (work: () => Promise<unknown>): void => {
    setSaving(true)
    setFailed(null)
    void work()
      .then(async () => {
        // Every query the beta makes hangs off this one key, so one line
        // here is the whole app agreeing with the database again. A gasto
        // moves Inicio, Gastos, Categorías and Proyecciones at once; naming
        // them one by one is a list that goes stale.
        await client.invalidateQueries({ queryKey: ['beta'] })
        setSaving(false)
        onDone()
      })
      .catch((error: unknown) => {
        setSaving(false)
        setFailed(saying(error))
      })
  }

  return { saving, failed, run }
}

// The failures a household can actually cause, said the way the rest of the
// app talks. Anything else falls through to its own message, which is better
// than "algo salió mal" when it names the real problem.
function saying(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'No se pudo guardar. Probá de nuevo.'
  }
  switch (error.name) {
    case 'CategoryInUseError':
      return 'No se puede borrar: todavía hay gastos o servicios en esta categoría.'
    case 'CategoryNameTakenError':
      return 'Ya existe una categoría con ese nombre.'
    case 'CardInUseError':
      return 'No se puede borrar: esta tarjeta tiene consumos o resúmenes.'
    case 'CardNameTakenError':
      return 'Ya hay una tarjeta con ese nombre.'
    case 'ResumenAlreadyPaidError':
      return 'Ese resumen ya está pagado, así que no admite cambios.'
    case 'PendienteAlreadyPaidError':
      return 'Ese servicio ya figura como pagado.'
    default:
      return error.message
  }
}
