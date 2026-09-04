import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Lock, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createFirestoreHouseholdsDb } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { authorDisplayNameFromAuth } from '@/lib/displayName'
import { useFirebase } from '@/lib/firebaseContext'
import { AuthHero } from './AuthHero'
import { finalizeHouseholdSignup } from './finalizeHouseholdSignup'
import { useHouseholdDraft } from './HouseholdDraftContext'
import { markReturningUser } from './returningUserStorage'
import { createFirebaseSignupAuth } from './signupAuth'
import type { SignupAuth } from './signupAuth'
import { AlertMessage } from '@/components/ui/alert-message'

export type SignupFormMode = 'signup' | 'login'

export type SignupFormFinishedResult = {
  readonly householdCreated: boolean
}

export type SignupFormProps = {
  readonly householdsDb?: HouseholdsDb
  readonly signupAuth?: SignupAuth
  readonly mode?: SignupFormMode
  readonly onFinished?: (result: SignupFormFinishedResult) => void
  readonly onAlreadyHaveAccount?: () => void
  // The symmetric escape hatch for login mode. Without it, a returning
  // visitor -- landed here automatically by hasReturningUser(), e.g. a
  // shared computer or a second household member's first sign-in on this
  // device -- had no way back to account creation short of reloading the
  // page.
  readonly onNoAccount?: () => void
}

export function SignupForm({
  householdsDb,
  signupAuth,
  mode = 'signup',
  onFinished,
  onAlreadyHaveAccount,
  onNoAccount,
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
  const isLogin = mode === 'login'
  const authErrorMessage = isLogin
    ? 'No se pudo iniciar sesión'
    : 'No se pudo crear la cuenta'
  const submitLabel = isLogin ? 'Iniciar sesión' : 'Crear cuenta'
  const passwordAutoComplete = isLogin ? 'current-password' : 'new-password'

  async function finishAuth(
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
          markReturningUser()
        } catch {
          setError(authErrorMessage)
          return
        }
      }

      if (draft === null) {
        if (isLogin) {
          onFinished?.({ householdCreated: false })
          return
        }
        setError('No se pudo guardar el hogar')
        return
      }

      try {
        const household = await finalizeHouseholdSignup({
          db,
          userId,
          draft,
          displayName: authorDisplayNameFromAuth(firebase.auth?.currentUser),
        })
        if (household === null) {
          setError('No se pudo guardar el hogar')
          return
        }
        clearDraft()
        onFinished?.({ householdCreated: true })
      } catch {
        setError('No se pudo guardar el hogar')
      }
    } finally {
      setPending(false)
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void finishAuth(() =>
      isLogin
        ? auth.signInWithEmail({ email, password })
        : auth.signUpWithEmail({ email, password }),
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <AuthHero />
      <div className="bg-card flex w-full flex-col items-center gap-6 rounded-3xl p-6">
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
                autoComplete={passwordAutoComplete}
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
            {submitLabel}
          </Button>
        </form>

        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="w-full"
          onClick={() => {
            void finishAuth(() =>
              isLogin ? auth.signInWithGoogle() : auth.signUpWithGoogle(),
            )
          }}
        >
          Continuar con Google
        </Button>

        {!isLogin && onAlreadyHaveAccount !== undefined ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onAlreadyHaveAccount}
          >
            Ya tengo una cuenta
          </Button>
        ) : null}

        {isLogin && onNoAccount !== undefined ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onNoAccount}
          >
            No tengo una cuenta
          </Button>
        ) : null}
      </div>
    </div>
  )
}
