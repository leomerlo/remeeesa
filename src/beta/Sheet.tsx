import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Every form in the app opens in one of these. It is a dialog: Escape
// closes it, the scrim closes it, focus moves into it on open and back to
// whatever opened it on close, and the page behind it does not scroll.
//
// Rendered through a portal so a sheet opened from deep inside a card is
// not clipped by that card, and so the scrim really does cover the screen
// rather than the column it was opened in.
export function Sheet({
  title,
  open,
  onClose,
  children,
  footer,
}: {
  readonly title: string
  readonly open: boolean
  readonly onClose: () => void
  readonly children: ReactNode
  readonly footer: ReactNode
}): ReactElement | null {
  const titleId = useId()
  const panel = useRef<HTMLDivElement | null>(null)
  const opener = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return undefined
    opener.current = document.activeElement
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // The page behind a sheet must not scroll under it, on a phone above
    // all, where the two scrolls fight each other.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Focus the first thing someone would type into, or the panel itself.
    const first = panel.current?.querySelector<HTMLElement>(
      'input, select, textarea, button:not([disabled])',
    )
    first?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
      if (opener.current instanceof HTMLElement) opener.current.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="scrim"
      onMouseDown={(event) => {
        // Only a press that both starts and ends on the scrim closes it:
        // a drag that began inside the sheet should not.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panel}
      >
        <div className="sheet-h">
          <h3 id={titleId}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>
        <div className="sheet-b">{children}</div>
        <div className="sheet-f">{footer}</div>
      </div>
    </div>,
    document.body,
  )
}

// What every sheet's footer says while the beta can only read. The form
// above it is finished and validates; this is the one wire that is not
// connected, and saying so is better than a button that does nothing.
export function ReadOnlyFoot(): ReactElement {
  return (
    <p className="readonly-note">
      La beta todavía no escribe en la base. El formulario está listo: falta
      habilitar el guardado.
    </p>
  )
}
