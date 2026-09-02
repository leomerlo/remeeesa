import type { ReactElement } from 'react'
import { Logo } from '@/components/Logo'
import type { HouseholdsDb } from '@/lib/households'
import { useShowNav } from './useShowNav'

export type AppHeaderProps = {
  readonly currentUserId?: string | null
  readonly householdsDb?: HouseholdsDb
}

// The one place the "remeeesa" wordmark stays visible once past the
// sign-up/log-in flow (AuthHero owns it there). Rendered by App.tsx above
// <main>, not by AppShell inside it -- a full-width bar, not boxed into the
// same max-w-md column every page's own content sits in. Shares AppShell's
// showNav condition so the header and the bottom nav appear and disappear
// together.
export function AppHeader({
  currentUserId,
  householdsDb,
}: AppHeaderProps): ReactElement | null {
  const showNav = useShowNav({ currentUserId, householdsDb })

  if (!showNav) {
    return null
  }

  return (
    <header className="bg-card flex w-full items-center justify-start px-6 py-4 sm:px-8">
      <Logo className="h-5" />
    </header>
  )
}
