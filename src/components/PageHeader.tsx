import type { ReactElement } from 'react'

export type PageHeaderProps = {
  readonly title: string
}

// The one page-level header every top-level screen (Home, Histórico,
// Categorías, Ajustes) uses -- before this, each screen invented its own:
// Home had an unlabeled floating <p>, Ajustes had none at all, Histórico/
// Categorías had a bare <h1> with no shared structure. All four are
// primary bottom-nav destinations, not drill-down sub-pages, so this stays
// a plain title -- no back-link or action slot, since the nav already
// covers navigation between them in one tap.
export function PageHeader({ title }: PageHeaderProps): ReactElement {
  return (
    <div className="w-full">
      <h1 className="text-title font-semibold">{title}</h1>
    </div>
  )
}
