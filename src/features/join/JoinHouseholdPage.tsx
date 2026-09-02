import { useEffect, useMemo, useState } from 'react'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { AlertMessage } from '@/components/ui/alert-message'
import type { FormEvent, ReactElement } from 'react'
import { useParams } from 'react-router-dom'
import { Lock, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthHero } from '@/features/onboarding/AuthHero'
import { createFirebaseSignupAuth } from '@/features/onboarding/signupAuth'
import type { SignupAuth } from '@/features/onboarding/signupAuth'
import { authorDisplayNameFromAuth } from '@/lib/displayName'
import { useFirebase } from '@/lib/firebaseContext'
import {
  AlreadyInHouseholdError,
  createFirestoreHouseholdsDb,
  joinHousehold,
} from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'

function messageForJoinError(error: unknown): string {
  if (error instanceof AlreadyInHouseholdError) {
    return 'Primero salí de tu hogar actual'
  }
  return 'No se pudo unir al hogar'
}

export type JoinHouseholdPageProps = {
  readonly currentUserId?: string | null
  readonly signupAuth?: SignupAuth
  readonly householdsDb?: HouseholdsDb
}

export function JoinHouseholdPage({
  currentUserId: currentUserIdProp,
  signupAuth,
  householdsDb,
}: JoinHouseholdPageProps): ReactElement {
  const { token } = useParams()
  const firebase = useFirebase()
  const [sessionUserId, setSessionUserId] = useState<string | null | undefined>(
    undefined,
  )
  const currentUserId =
    currentUserIdProp !== undefined ? currentUserIdProp : sessionUserId
  const auth = signupAuth ?? createFirebaseSignupAuth(firebase.auth)
  const db = useMemo(
    () => householdsDb ?? createFirestoreHouseholdsDb(firebase.db),
    [householdsDb, firebase.db],
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (currentUserIdProp !== undefined) {
      return
    }
    return firebase.auth.onAuthStateChanged((user) => {
      setSessionUserId(user?.uid ?? null)
    })
  }, [currentUserIdProp, firebase.auth])

  useEffect(() => {
    if (typeof currentUserId !== 'string' || token === undefined) {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        await joinHousehold({
          db,
          userId: currentUserId,
          token,
          displayName: authorDisplayNameFromAuth(firebase.auth?.currentUser),
        })
        if (!cancelled) {
          setJoined(true)
        }
      } catch (error) {
        if (!cancelled) {
          setError(messageForJoinError(error))
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // firebase.auth?.currentUser is a live, imperatively-mutated snapshot,
    // not reactive state -- read fresh each run rather than watched as a
    // dependency, same idiom the auth-state effect above already uses for
    // firebase.auth itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, token, db])

  async function joinAfterAuth(
    authenticate: () => Promise<{ readonly userId: string }>,
  ): Promise<void> {
    if (token === undefined) {
      setError('No se pudo unir al hogar')
      return
    }
    setError(null)
    setPending(true)
    try {
      let userId: string
      try {
        const signedIn = await authenticate()
        userId = signedIn.userId
      } catch {
        setError('No se pudo crear la cuenta')
        return
      }

      try {
        await joinHousehold({
          db,
          userId,
          token,
          displayName: authorDisplayNameFromAuth(firebase.auth?.currentUser),
        })
        setJoined(true)
      } catch (error) {
        setError(messageForJoinError(error))
      }
    } finally {
      setPending(false)
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void joinAfterAuth(() => auth.signUpWithEmail({ email, password }))
  }

  if (joined) {
    return (
      <p role="status" className="text-sm font-medium">
        Te uniste al hogar
      </p>
    )
  }

  if (currentUserId !== null) {
    if (error !== null) {
      return <AlertMessage>{error}</AlertMessage>
    }
    return <LoadingIndicator label="Uniéndote…" />
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <AuthHero />
      <div className="bg-card shadow-resting flex w-full flex-col items-center gap-6 rounded-3xl p-6">
        <form className="flex w-full flex-col gap-6" onSubmit={onSubmit}>
          <div className="flex w-full flex-col gap-2">
            <Label
              htmlFor="signup-email"
              className="text-muted-foreground font-medium"
            >
              Email
            </Label>
            <div className="relative flex items-center">
              <Mail
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute left-3.5 size-4"
              />
              <Input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                }}
                className="pl-10"
              />
            </div>
          </div>

          <div className="flex w-full flex-col gap-2">
            <Label
              htmlFor="signup-password"
              className="text-muted-foreground font-medium"
            >
              Contraseña
            </Label>
            <div className="relative flex items-center">
              <Lock
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute left-3.5 size-4"
              />
              <Input
                id="signup-password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                }}
                className="pl-10"
              />
            </div>
          </div>

          {error !== null ? <AlertMessage>{error}</AlertMessage> : null}

          <Button type="submit" disabled={pending} className="w-full">
            Crear cuenta
          </Button>
        </form>

        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="w-full"
          onClick={() => {
            void joinAfterAuth(() => auth.signUpWithGoogle())
          }}
        >
          Continuar con Google
        </Button>
      </div>
    </div>
  )
}
