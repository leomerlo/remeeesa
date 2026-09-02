import type { ReactElement } from 'react'
import { Illustration } from '@/components/Illustration'
import budgetPiggy from '@/assets/illustrations/budget-piggy.webp'

export type PiggyBankIllustrationProps = {
  readonly className?: string
}

// The mascot dropping a coin into a piggy bank, on the remaining-budget card.
// Keeps the piggy-bank motif the approved Home comp was built around, now as
// the real illustration rather than the hand-drawn SVG stand-in it replaced.
export function PiggyBankIllustration({
  className,
}: PiggyBankIllustrationProps): ReactElement {
  return (
    <Illustration
      src={budgetPiggy}
      {...(className === undefined ? {} : { className })}
    />
  )
}
