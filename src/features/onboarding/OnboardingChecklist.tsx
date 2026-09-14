import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { allExpensesQueryKey } from '@/features/expenses'
import { householdQueryKey } from '@/features/household'
import { pendientesQueryKey } from '@/features/pendientes'
import { formatCurrency, listAllExpenses } from '@/lib/expenses'
import { getHousehold } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { listPendientes } from '@/lib/pendientes'
import { cn } from '@/lib/utils'
import {
  hasFinishedOnboarding,
  markOnboardingFinished,
} from './onboardingStorage'

export type OnboardingChecklistProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // Home owns the add sheet, so the third step asks it to open rather than
  // mounting a second one of its own.
  readonly onAddGasto: () => void
}

type Step = {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly done: boolean
  readonly action: ReactElement | null
}

function StepRow({ step }: { readonly step: Step }): ReactElement {
  return (
    <li className="flex w-full items-start gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2',
          step.done
            ? 'border-transparent bg-primary'
            : 'border-border bg-transparent',
        )}
      >
        {step.done ? (
          <Check className="size-3.5 text-primary-foreground" />
        ) : null}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn('font-medium', step.done && 'text-muted-foreground')}>
          {step.title}
        </p>
        <p className="text-muted-foreground text-xs">{step.detail}</p>
        {step.action === null ? null : (
          <div className="pt-1">{step.action}</div>
        )}
      </div>
    </li>
  )
}

// The first thing a new household sees on Home, and the only place the app
// states its own premise: remeeesa starts from a budget and counts down
// from it, rather than being a list that adds up. Per direct feedback.
//
// Nothing is stored about "progress": each step is simply read off the
// household's own data, so it ticks itself the moment the thing is actually
// done, from any device. Once all three are done the card is gone for good
// (see onboardingStorage for the shortcut that stops it asking again).
export function OnboardingChecklist({
  db,
  householdId,
  onAddGasto,
}: OnboardingChecklistProps): ReactElement | null {
  const [finished] = useState(() => hasFinishedOnboarding())

  const householdQuery = useQuery({
    queryKey: householdQueryKey({ householdId }),
    queryFn: () => getHousehold({ db, householdId }),
    enabled: !finished,
  })
  const pendientesQuery = useQuery({
    // Nested, not the bare prefix: PendienteDueSoonBanner already owns that
    // exact key with a { pendientes, categories } shape, and two queries
    // under one key must return the same thing.
    queryKey: [...pendientesQueryKey({ householdId }), 'all'],
    queryFn: () => listPendientes({ db, householdId }),
    enabled: !finished,
  })
  const expensesQuery = useQuery({
    queryKey: allExpensesQueryKey({ householdId }),
    queryFn: () => listAllExpenses({ db, householdId }),
    enabled: !finished,
  })

  const household = householdQuery.data
  const pendientes = pendientesQuery.data
  const expenses = expensesQuery.data
  const isLoaded =
    household !== undefined &&
    pendientes !== undefined &&
    expenses !== undefined

  const hasBudget = household !== undefined && household.monthlyBudget > 0
  const hasServicio = pendientes !== undefined && pendientes.length > 0
  const hasGasto = expenses !== undefined && expenses.length > 0
  const allDone = isLoaded && hasBudget && hasServicio && hasGasto

  // Writing to localStorage, not to React state: `allDone` already hides
  // the card in this render, and the flag is only there so the next visit to
  // Home skips the three queries entirely.
  useEffect(() => {
    if (allDone) {
      markOnboardingFinished()
    }
  }, [allDone])

  // Nothing at all until every answer is in: a card that appears a beat
  // later with steps already ticked is worse than one that waits.
  if (finished || !isLoaded || allDone) {
    return null
  }

  const steps: readonly Step[] = [
    {
      id: 'budget',
      title: 'Definí el presupuesto del mes',
      detail: hasBudget
        ? `${formatCurrency(household.monthlyBudget)} por mes. Todo lo que carguen se descuenta de ahí.`
        : 'Cuánto manejan por mes. Es el techo del que van bajando.',
      done: hasBudget,
      action: hasBudget ? null : (
        <Button asChild variant="outline" size="sm">
          <Link to="/household">Poner presupuesto</Link>
        </Button>
      ),
    },
    {
      id: 'servicios',
      title: 'Cargá los servicios que se repiten',
      detail:
        'Alquiler, internet, expensas: lo que ya saben que viene todos los meses.',
      done: hasServicio,
      action: hasServicio ? null : (
        <Button asChild variant="outline" size="sm">
          <Link to="/pendientes">Ir a Servicios</Link>
        </Button>
      ),
    },
    {
      id: 'gasto',
      title: 'Anotá tu primer gasto',
      detail: 'Lo del día a día, en el momento en que lo pagás.',
      done: hasGasto,
      action: hasGasto ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onAddGasto()
          }}
        >
          Cargar el primero
        </Button>
      ),
    },
  ]

  return (
    <section
      aria-labelledby="onboarding-checklist-title"
      className="bg-card flex w-full flex-col gap-4 rounded-2xl p-5"
    >
      {/* The card fills the width it is given, but its prose does not: a
          sentence running the width of a 27" monitor is not read, it is
          skipped. */}
      <div className="flex w-full max-w-2xl flex-col gap-2">
        <h2
          id="onboarding-checklist-title"
          className="text-title font-semibold"
        >
          Empezá por acá
        </h2>
        <p className="text-muted-foreground text-sm">
          remeeesa arranca de un presupuesto: ponen cuánto manejan por mes y
          cada gasto se descuenta de ahí.
        </p>
      </div>
      <ul className="flex w-full max-w-2xl flex-col gap-4">
        {steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </ul>
      <p className="text-muted-foreground border-border-subtle w-full max-w-2xl border-t pt-4 text-xs">
        ¿Son dos en la casa?{' '}
        <Link to="/household" className="text-foreground underline">
          Compartí el link de invitación
        </Link>
        .
      </p>
    </section>
  )
}
