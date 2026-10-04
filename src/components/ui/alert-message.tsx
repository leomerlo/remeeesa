import type { ReactNode } from 'react'
import { AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AlertMessageProps = {
  readonly children: ReactNode
  // 'error' is the default and what every form uses. 'info' is the same
  // shape in the app's blue, for a line that explains a screen rather than
  // reporting that something went wrong -- said as an alert so it reads as
  // part of the interface instead of as a paragraph left on the page.
  readonly tone?: 'error' | 'info'
  readonly className?: string
}

// The one error-message treatment every form in the app uses. Before this,
// every role="alert" across the app (bar one, which reached for a
// text-destructive class this project's token set never defined -- see
// button.tsx's own comment on why `destructive` was dropped -- so it also
// rendered as plain, colorless text) was indistinguishable from an ordinary
// caption: same size, same weight, no color. "No se pudo guardar el
// pendiente" read exactly like "Categoría desconocida" and was easy to miss
// entirely.
export function AlertMessage({
  children,
  tone = 'error',
  className,
}: AlertMessageProps): ReactNode {
  const isInfo = tone === 'info'
  const Icon = isInfo ? Info : AlertCircle
  return (
    <p
      // An explanation is not an alert: announcing it would interrupt a
      // screen reader with something that has not changed and is not urgent.
      {...(isInfo ? {} : { role: 'alert' })}
      className={cn(
        // rounded-xl, not the card radius: at the card's corner a
        // three-line message read as a pill with corners wider than its own
        // padding. A notice is a small box, not a panel.
        'flex w-full items-start gap-2 rounded-xl p-3 text-sm font-medium',
        isInfo ? 'bg-info/10 text-info' : 'bg-error/10 text-error',
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}
