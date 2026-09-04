import type { ReactElement } from 'react'
import { Illustration } from '@/components/Illustration'
import welcome from '@/assets/illustrations/welcome.webp'

export type OnboardingIllustrationProps = {
  readonly className?: string
}

// The mascot celebrating, for the sign-up/log-in hero -- this is the first
// screen anyone sees, so it leads with the app's tone rather than with a
// neutral graphic.
export function OnboardingIllustration({
  className,
}: OnboardingIllustrationProps): ReactElement {
  return (
    <Illustration
      src={welcome}
      {...(className === undefined ? {} : { className })}
    />
  )
}
