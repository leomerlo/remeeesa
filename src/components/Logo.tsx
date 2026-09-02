import type { ReactElement } from 'react'
import logo from '@/assets/logo.png'
import { cn } from '@/lib/utils'

export type LogoProps = {
  readonly className?: string
  // The source asset is a black wordmark on a transparent background --
  // fine on the app's light backgrounds ("dark", the default), but
  // invisible on the auth hero's purple gradient. "light" forces it to a
  // solid white silhouette (brightness-0 turns every opaque pixel black,
  // invert flips that to white) instead of needing a second asset.
  readonly variant?: 'dark' | 'light'
}

// The "remeeesa" wordmark. Unlike the illustrations in Illustration.tsx,
// this is never purely decorative -- it is the one place on a given screen
// (the auth hero, the app-wide header) that actually names the app, so it
// keeps a real accessible name instead of being hidden from assistive tech.
export function Logo({ className, variant = 'dark' }: LogoProps): ReactElement {
  return (
    <img
      src={logo}
      alt="remeeesa"
      decoding="async"
      className={cn(
        'object-contain',
        variant === 'light' && 'brightness-0 invert',
        className,
      )}
    />
  )
}
