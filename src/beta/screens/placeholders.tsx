import type { ReactElement } from 'react'

// Each of these is replaced by its real screen, one at a time. Kept as a
// named stub rather than an empty route so the shell can be navigated and
// reviewed before every screen exists.
export function Pending({ title }: { readonly title: string }): ReactElement {
  return (
    <>
      <header className="head">
        <h1 className="page-title">{title}</h1>
      </header>
      <div className="card empty">
        <span className="orb" aria-hidden="true" />
        <h3>Todavía no está escrita</h3>
        <p>Esta pantalla llega en el próximo paso.</p>
      </div>
    </>
  )
}
