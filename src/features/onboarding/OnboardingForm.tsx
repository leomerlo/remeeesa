import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { HouseholdsDb } from '@/lib/households'
import { AuthHero } from './AuthHero'
import { parseHouseholdDraft } from './householdDraft'
import { useHouseholdDraft } from './HouseholdDraftContext'
import { hasReturningUser } from './returningUserStorage'
import { SignupForm } from './SignupForm'
import type { SignupAuth } from './signupAuth'
import { AlertMessage } from '@/components/ui/alert-message'

type OnboardingStep = 'household' | 'signup' | 'login'

export type OnboardingFormProps = {
  readonly householdsDb?: HouseholdsDb
  readonly signupAuth?: SignupAuth
  readonly onFinished?: () => void
}

export function OnboardingForm({
  householdsDb,
  signupAuth,
  onFinished,
}: OnboardingFormProps): ReactElement {
  const { draft, saveDraft } = useHouseholdDraft()
  const [name, setName] = useState('')
  const [monthlyBudget, setMonthlyBudget] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const [step, setStep] = useState<OnboardingStep>(() =>
    hasReturningUser() ? 'login' : 'household',
  )

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const parsed = parseHouseholdDraft({ name, monthlyBudget })
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }

    setError(null)
    saveDraft(parsed.draft)
    setStep('signup')
  }

  if (finished) {
    return (
      <p role="status" className="text-sm font-medium">
        Hogar guardado
      </p>
    )
  }

  if (step === 'login') {
    return (
      <SignupForm
        householdsDb={householdsDb}
        signupAuth={signupAuth}
        mode="login"
        onFinished={({ householdCreated }) => {
          if (householdCreated) {
            setFinished(true)
          } else {
            setStep('household')
          }
          onFinished?.()
        }}
        onNoAccount={() => {
          setStep('household')
        }}
      />
    )
  }

  if (step === 'signup' || draft !== null) {
    return (
      <SignupForm
        householdsDb={householdsDb}
        signupAuth={signupAuth}
        onFinished={() => {
          setFinished(true)
          onFinished?.()
        }}
        onAlreadyHaveAccount={() => {
          setStep('login')
        }}
      />
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <AuthHero />
      <form
        className="bg-card shadow-resting flex w-full flex-col items-center gap-6 rounded-3xl p-6"
        onSubmit={onSubmit}
      >
        <div className="flex w-full flex-col gap-2">
          <Label
            htmlFor="household-name"
            className="text-muted-foreground font-medium"
          >
            Nombre del hogar
          </Label>
          <Input
            id="household-name"
            name="household-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
            }}
            autoComplete="organization"
          />
        </div>

        <div className="flex w-full flex-col items-center gap-2">
          <Label
            htmlFor="monthly-budget"
            className="text-muted-foreground font-medium"
          >
            Presupuesto mensual
          </Label>
          <Input
            id="monthly-budget"
            name="monthly-budget"
            value={monthlyBudget}
            onChange={(event) => {
              setMonthlyBudget(event.target.value)
            }}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            className="h-auto border-0 px-0 text-center font-display text-5xl tracking-tight md:text-5xl"
          />
          <p className="text-muted-foreground text-sm">
            Cuánto podés gastar por mes
          </p>
        </div>

        {error !== null ? <AlertMessage>{error}</AlertMessage> : null}

        <Button type="submit" className="w-full">
          Continuar
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setStep('login')
          }}
        >
          Ya tengo una cuenta
        </Button>
      </form>
    </div>
  )
}
