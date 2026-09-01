import type { ReactElement, ReactNode } from 'react'

export type PageHeaderProps = {
  readonly title: string
  readonly leading?: ReactNode
  readonly action?: ReactNode
}

// The one page-level header every top-level screen (Home, Histórico,
// Categorías, Ajustes) uses -- before this, each screen invented its own:
// Home had an unlabeled floating <p>, Ajustes had none at all (just a
// "Volver" link with no title), Histórico/Categorías had a bare <h1> with
// no shared structure. `leading` sits above the title row (Ajustes' "Volver"
// link -- back navigation reads top-left, before the title). `action` is a
// single right-aligned control next to the title (Home's Ajustes shortcut
// icon-link).
export function PageHeader({
  title,
  leading,
  action,
}: PageHeaderProps): ReactElement {
  return (
    <div className="flex w-full flex-col gap-2">
      {leading}
      <div className="flex w-full items-center justify-between">
        <h1 className="text-title font-semibold">{title}</h1>
        {action}
      </div>
    </div>
  )
}
