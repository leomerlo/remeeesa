import { ArrowRight, Sparkles } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { Sheet } from './Sheet'
import { markWelcomeSeen, welcomeSeen } from './welcome'

// The one thing the app ever says about itself: that it is not the app it
// was. Everybody coming into the beta used the old one for months, so the
// screen they land on is unrecognisable, and the first question is "¿se
// perdió todo?" -- which is the only question worth answering here. What
// changed is how it looks, not what it does, so there is nothing to list:
// a list of features would read as a list of things to learn.
//
// Shown once per browser and never again, by the ordinary dialog every
// form opens in: a bottom sheet on a phone, centred on a desktop, Escape
// and the scrim both closing it. Closing it any of those ways is what
// counts as having read it.
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
            Ir al inicio
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
          <span className="say">Más moderna y más fácil de leer.</span>
        </div>
        <p className="welcome-say">
          Las funciones son las mismas de siempre y tus datos siguen enteros:
          todo lo que cargaste está acá. Lo que cambió es cómo se ve.
        </p>
      </div>
    </Sheet>
  )
}
