import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createFirebaseSignupAuth } from '@/features/onboarding/signupAuth'
import type { SignupAuth } from '@/features/onboarding/signupAuth'
import { useFirebase } from '@/lib/firebaseContext'
import { createFirestoreHouseholdsDb, joinHousehold } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'

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
        await joinHousehold({ db, userId: currentUserId, token })
        if (!cancelled) {
          setJoined(true)
        }
      } catch {
        if (!cancelled) {
          setError('Could not join household')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentUserId, token, db])

  async function joinAfterAuth(
    authenticate: () => Promise<{ readonly userId: string }>,
  ): Promise<void> {
    if (token === undefined) {
      setError('Could not join household')
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
        setError('Could not create account')
        return
      }

      try {
        await joinHousehold({ db, userId, token })
        setJoined(true)
      } catch {
        setError('Could not join household')
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
        Joined household
      </p>
    )
  }

  if (currentUserId !== null) {
    if (error !== null) {
      return (
        <p role="alert" className="text-sm font-medium">
          {error}
        </p>
      )
    }
    return (
      <p role="status" className="text-sm font-medium">
        Joining…
      </p>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <form className="flex w-full flex-col gap-8" onSubmit={onSubmit}>
        <div className="flex w-full flex-col gap-2">
          <Label
            htmlFor="signup-email"
            className="text-muted-foreground font-medium"
          >
            Email
          </Label>
          <Input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
            }}
          />
        </div>

        <div className="flex w-full flex-col gap-2">
          <Label
            htmlFor="signup-password"
            className="text-muted-foreground font-medium"
          >
            Password
          </Label>
          <Input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
            }}
          />
        </div>

        {error !== null ? (
          <p role="alert" className="text-sm font-medium">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending}>
          Create account
        </Button>
      </form>

      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => {
          void joinAfterAuth(() => auth.signUpWithGoogle())
        }}
      >
        Continue with Google
      </Button>
    </div>
  )
}
