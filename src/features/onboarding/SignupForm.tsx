import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createFirestoreHouseholdsDb } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { useFirebase } from '@/lib/firebaseContext'
import { finalizeHouseholdSignup } from './finalizeHouseholdSignup'
import { useHouseholdDraft } from './HouseholdDraftContext'
import { createFirebaseSignupAuth } from './signupAuth'
import type { SignupAuth } from './signupAuth'

export type SignupFormProps = {
  readonly householdsDb?: HouseholdsDb
  readonly signupAuth?: SignupAuth
  readonly onFinished?: () => void
}

export function SignupForm({
  householdsDb,
  signupAuth,
  onFinished,
}: SignupFormProps): ReactElement {
  const firebase = useFirebase()
  const { draft, clearDraft } = useHouseholdDraft()
  const auth = signupAuth ?? createFirebaseSignupAuth(firebase.auth)
  const db = householdsDb ?? createFirestoreHouseholdsDb(firebase.db)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [signedInUserId, setSignedInUserId] = useState<string | null>(null)

  async function finishSignup(
    authenticate: () => Promise<{ readonly userId: string }>,
  ): Promise<void> {
    setError(null)
    setPending(true)
    try {
      let userId = signedInUserId
      if (userId === null) {
        try {
          const signedIn = await authenticate()
          userId = signedIn.userId
          setSignedInUserId(userId)
        } catch {
          setError('Could not create account')
          return
        }
      }

      try {
        const household = await finalizeHouseholdSignup({
          db,
          userId,
          draft,
        })
        if (household === null) {
          setError('Could not save household')
          return
        }
        clearDraft()
        onFinished?.()
      } catch {
        setError('Could not save household')
      }
    } finally {
      setPending(false)
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void finishSignup(() => auth.signUpWithEmail({ email, password }))
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
          void finishSignup(() => auth.signUpWithGoogle())
        }}
      >
        Continue with Google
      </Button>
    </div>
  )
}
