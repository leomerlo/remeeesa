import type { ReactElement } from 'react'
import { Illustration } from '@/components/Illustration'
import { ILLUSTRATIONS } from '@/components/illustrations'
import type { BudgetTone } from '@/lib/expenses'

export type PiggyBankIllustrationProps = {
  readonly className?: string
  // Which way the month is going. Omitted keeps the piggy bank, which is
  // what the card shows before there is a figure to react to.
  readonly tone?: BudgetTone
  // The month is not just spent but past the budget -- a different thing to
  // say than "nearly out", so a different drawing.
  readonly overBudget?: boolean
}

// The mascot on the remaining-budget card, reacting to the month.
//
// It used to be the piggy bank at every reading, which meant the one card
// whose whole job is to say how the month is going had a drawing that said
// the same thing at 10% and at 130%. The cast it picks from is the same one
// the empty states use (see components/illustrations).
const TONE_ILLUSTRATION: Readonly<Record<BudgetTone, string>> = {
  // Room left: sitting on a throne of coins.
  sky: ILLUSTRATIONS.flush,
  // Getting tight: out comes the calculator.
  pink: ILLUSTRATIONS.counting,
  // Nearly out: a jar with a few coins rattling in the bottom.
  red: ILLUSTRATIONS.nearlyEmpty,
}

export function PiggyBankIllustration({
  className,
  tone,
  overBudget = false,
}: PiggyBankIllustrationProps): ReactElement {
  const src = overBudget
    ? ILLUSTRATIONS.unimpressed
    : tone === undefined
      ? ILLUSTRATIONS.saving
      : TONE_ILLUSTRATION[tone]
  return (
    <Illustration
      src={src}
      {...(className === undefined ? {} : { className })}
    />
  )
}
