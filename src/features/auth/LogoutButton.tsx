import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { useFirebase } from '@/lib/firebaseContext'

export type LogoutButtonProps = {
  readonly signOutSession?: () => Promise<void>
  readonly onSignedOut?: () => void
}

export function LogoutButton({
  signOutSession,
  onSignedOut,
}: LogoutButtonProps): ReactElement {
  const firebase = useFirebase()

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => {
        void (async () => {
          if (signOutSession !== undefined) {
            await signOutSession()
          } else {
            await firebase.auth.signOut()
          }
          onSignedOut?.()
        })()
      }}
    >
      Cerrar sesión
    </Button>
  )
}
