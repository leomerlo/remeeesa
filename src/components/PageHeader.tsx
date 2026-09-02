import type { ReactElement, ReactNode, Ref } from 'react'
import { cn } from '@/lib/utils'

export type PageHeaderProps = {
  readonly title: string
  // Right-hand slot on the title row: a month total, an amount due. Sits on
  // the baseline with the title rather than becoming a second heading.
  readonly trailing?: ReactNode
  readonly headingRef?: Ref<HTMLHeadingElement>
  // Home passes this for the household's own chosen name: the same violet
  // gradient the budget hero and auth cards use, so the one title on this
  // screen that is actually *yours* (not a generic screen label like every
  // other page's title) reads as such. Every other PageHeader stays plain.
  readonly gradient?: boolean
}

// The one page-level header every top-level screen (Home, Histórico,
// Categorías, Pendientes, Ajustes) uses -- before this, each screen invented its
// own: Home had an unlabeled floating <p>, Ajustes had none at all, Pendientes
// centred a bare <h1> while everything else was left-aligned. All of them are
// primary destinations, not drill-down sub-pages, so this stays a plain title
// -- no back-link, since the nav already covers navigation in one tap.
export function PageHeader({
  title,
  trailing,
  headingRef,
  gradient = false,
}: PageHeaderProps): ReactElement {
  return (
    <div className="flex w-full items-baseline justify-between gap-3">
      {/* tabIndex -1 so a screen that closes a sheet can put focus back on
          the page itself when the element that opened it is gone. */}
      <h1
        ref={headingRef}
        tabIndex={-1}
        className={cn(
          'text-title font-semibold outline-none',
          gradient &&
            'from-primary to-[var(--surface-action-gradient-end)] bg-gradient-to-br bg-clip-text text-transparent',
        )}
      >
        {title}
      </h1>
      {trailing === undefined ? null : (
        <span className="text-muted-foreground shrink-0 text-sm font-medium">
          {trailing}
        </span>
      )}
    </div>
  )
}
