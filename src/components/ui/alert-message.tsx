import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AlertMessageProps = {
  readonly children: ReactNode
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
  className,
}: AlertMessageProps): ReactNode {
  return (
    <p
      role="alert"
      className={cn(
        'bg-error/10 text-error flex w-full items-start gap-2 rounded-2xl p-3 text-sm font-medium',
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}
