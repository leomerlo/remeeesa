import type { ReactElement } from 'react'
import { Illustration } from '@/components/Illustration'
import emptyNotes from '@/assets/illustrations/empty-notes.webp'

export type EmptyExpensesIllustrationProps = {
  readonly className?: string
}

// The mascot with a notepad and pencil, for "nothing recorded yet" states --
// it reads as about to write the first entry, rather than as an error.
export function EmptyExpensesIllustration({
  className,
}: EmptyExpensesIllustrationProps): ReactElement {
  return (
    <Illustration
      src={emptyNotes}
      {...(className === undefined ? {} : { className })}
    />
  )
}
