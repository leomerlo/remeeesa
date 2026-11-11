import { Check, Loader2, Trash2, X } from 'lucide-react'
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

// The one action every sheet ends with, and the three things that can be
// true of it: the form is not filled in yet, the beta is not allowed to
// write this at all, or the write was attempted and failed.
export function SheetFoot({
  label,
  saving,
  blocked,
  locked,
  failed,
  onSave,
  secondary,
}: {
  readonly label: string
  readonly saving: boolean
  // The form is incomplete. The button is dead, and the form has already
  // said what is missing -- nothing more to add here.
  readonly blocked: boolean
  // Why the beta will not write this, in the household's own words. Null
  // when it will.
  readonly locked: string | null
  readonly failed: string | null
  readonly onSave: () => void
  // A second way out of the same form, where the form really has two: not
  // "cancel" -- the X and the scrim already do that -- but another thing
  // it can be used for. Paying a bill is the one: the figure that arrived
  // can be written down before anybody pays it.
  readonly secondary?: {
    readonly label: string
    readonly icon?: ReactNode
    readonly onPress: () => void
  }
}): ReactElement {
  return (
    <div className="sheet-acts">
      <button
        className="btn btn-primary btn-block"
        type="button"
        disabled={saving || blocked || locked !== null}
        aria-disabled={saving || blocked || locked !== null}
        onClick={onSave}
      >
        {saving ? <Loader2 className="spin" /> : <Check />}
        {saving ? 'Guardando…' : label}
      </button>
      {secondary === undefined ? null : (
        <button
          className="btn btn-secondary btn-block"
          type="button"
          disabled={saving || blocked || locked !== null}
          aria-disabled={saving || blocked || locked !== null}
          onClick={secondary.onPress}
        >
          {secondary.icon}
          {secondary.label}
        </button>
      )}
      {failed === null ? null : (
        <p className="fproblem" role="alert">
          {failed}
        </p>
      )}
      {locked === null ? null : <p className="readonly-note">{locked}</p>}
    </div>
  )
}

// Deleting, which sits at the bottom of the form it belongs to rather than
// in the footer: it is not what you came to do.
export function DangerAction({
  label,
  saving,
  locked,
  onPress,
}: {
  readonly label: string
  readonly saving: boolean
  readonly locked: string | null
  readonly onPress: () => void
}): ReactElement {
  return (
    <button
      className="btn btn-danger btn-block"
      type="button"
      disabled={saving || locked !== null}
      aria-disabled={saving || locked !== null}
      onClick={onPress}
    >
      <Trash2 />
      {label}
    </button>
  )
}
