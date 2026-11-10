import {
  ArrowRight,
  CalendarCheck,
  CreditCard,
  Eye,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { Sheet } from './Sheet'
import { markWelcomeSeen, welcomeSeen } from './welcome'

// The one thing the app ever says about itself: that it is not the app it
// was. Everybody coming into the beta used the old one for months, so the
// screen they land on is unrecognisable, and the first question is "¿se
// perdió todo?" -- which the band answers before the three changes do.
//
// Shown once per browser and never again, by the ordinary dialog every
// form opens in: a bottom sheet on a phone, centred on a desktop, Escape
// and the scrim both closing it. Closing it any of those ways is what
// counts as having read it.
const WHAT_CHANGED: readonly {
  readonly Icon: typeof Eye
  readonly head: string
  readonly say: string
}[] = [
  {
    Icon: Eye,
    head: 'Todo más grande',
    say: 'Números que se leen de una, sin letra chica ni gris sobre gris.',
  },
  {
    Icon: CreditCard,
    head: 'La tarjeta, por fin clara',
    say: 'Cada consumo cae en el resumen del mes que lo paga, con sus cuotas.',
  },
  {
    Icon: CalendarCheck,
    head: 'Los servicios al día',
    say: 'Lo que falta pagar, con su fecha. El débito automático se marca solo.',
  },
]

export function Bienvenida(): ReactElement | null {
  // Read once, on the way in: a flag that changed while the modal is open
  // is this modal changing it.
  const [open, setOpen] = useState(() => !welcomeSeen())

  const close = (): void => {
    markWelcomeSeen()
    setOpen(false)
  }

  if (!open) return null

  return (
    <Sheet
      title="Bienvenidos al nuevo remeeesa"
      open
      onClose={close}
      footer={
        <div className="sheet-acts">
          <button
            className="btn btn-primary btn-block"
            type="button"
            onClick={close}
          >
            <ArrowRight />
            Ver mi mes
          </button>
        </div>
      }
    >
      <div className="welcome">
        <div className="welcome-band">
          <span className="kick">
            <Sparkles aria-hidden="true" />
            Versión nueva
          </span>
          <p>Rediseñamos la app de cero.</p>
          <span className="say">
            Tus datos siguen enteros: todo lo que cargaste está acá, en
            pantallas nuevas.
          </span>
        </div>
        <div className="welcome-list">
          {WHAT_CHANGED.map((one) => (
            <div className="one" key={one.head}>
              <span className="tile" aria-hidden="true">
                <one.Icon />
              </span>
              <div>
                <h4>{one.head}</h4>
                <p>{one.say}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
