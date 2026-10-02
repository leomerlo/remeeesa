import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertMessage } from '@/components/ui/alert-message'
import { useState, useMemo } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMonthLabel } from '@/lib/format'
import { budgetableMonths, monthKey, monthlyBudgetFor } from '@/lib/households'
import { formatCurrency } from '@/lib/expenses'
import {
  getHousehold,
  parseHouseholdName,
  parseMonthlyBudget,
  updateHousehold,
} from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { householdQueryKey } from './householdQueryKey'

export type EditHouseholdFormProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
}

export function EditHouseholdForm({
  db,
  householdId,
}: EditHouseholdFormProps): ReactElement {
  const queryClient = useQueryClient()
  const queryKey = householdQueryKey({ householdId })
  const householdQuery = useQuery({
    queryKey,
    queryFn: () => getHousehold({ db, householdId }),
  })
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // What the last save actually did, named out loud. Without it a save the
  // database refused looked identical to one that worked: the only feedback
  // was the "Actual:" line, which does not move when nothing was written.
  // Per direct feedback.
  const [saved, setSaved] = useState<string | null>(null)
  const household = householdQuery.data
  const name = nameDraft ?? (household !== undefined ? household.name : '')
  // A budget belongs to the month it was decided for -- see
  // lib/households/monthlyBudget -- so this field is always about one
  // month. It defaults to the current one, which is what setting a budget
  // almost always means; any other month is reachable so one left unset, or
  // set wrong, can be corrected without editing the database by hand.
  const thisMonth = useMemo(() => new Date(), [])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const months = useMemo(
    () => (household === undefined ? [] : budgetableMonths({ household })),
    [household],
  )
  const selectedMonth =
    months.find((month) => monthKey(month) === selectedKey) ?? thisMonth
  const currentBudget =
    household === undefined ? 0 : monthlyBudgetFor(household, selectedMonth)
  const amount = budgetDraft ?? (currentBudget > 0 ? String(currentBudget) : '')

  const mutation = useMutation({
    mutationFn: (input: {
      readonly name: string
      readonly monthlyBudget: number
    }) =>
      updateHousehold({
        db,
        month: selectedMonth,
        householdId,
        name: input.name,
        monthlyBudget: input.monthlyBudget,
      }),
    onSuccess: async (updated, variables) => {
      queryClient.setQueryData(queryKey, updated)
      setNameDraft(null)
      setBudgetDraft(null)
      setError(null)
      setSaved(
        variables.monthlyBudget === 0
          ? `Guardado: ${formatMonthLabel(selectedMonth)} queda sin presupuesto.`
          : `Guardado: ${formatCurrency(variables.monthlyBudget)} para ${formatMonthLabel(selectedMonth)}.`,
      )
      await queryClient.invalidateQueries({ queryKey })
    },
    // There was no onError at all, so anything the database refused failed
    // in silence -- the form simply did nothing and said nothing.
    onError: (caught: unknown) => {
      setSaved(null)
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo guardar. Volvé a intentar.',
      )
    },
  })

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    try {
      const nextName = parseHouseholdName(name)
      const monthlyBudget = parseMonthlyBudget(Number(amount.trim()))
      setError(null)
      setSaved(null)
      mutation.mutate({ name: nextName, monthlyBudget })
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'No se pudo guardar el hogar'
      setSaved(null)
      setError(message)
    }
  }

  return (
    <form
      className="flex w-full flex-col items-center gap-6"
      onSubmit={onSubmit}
    >
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="household-name">Nombre del hogar</Label>
        <Input
          id="household-name"
          name="household-name"
          value={name}
          onChange={(event) => {
            setNameDraft(event.target.value)
          }}
          autoComplete="organization"
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="monthly-budget">Presupuesto mensual</Label>
          {/* The confirmed, saved amount -- separate from `amount` above,
              which tracks the in-progress draft. Lets a rejected submission
              (e.g. a negative budget) visibly leave the real value unchanged
              instead of just clearing an error message. Always shown: it is
              the only confirmation that a save landed. */}
          {household !== undefined ? (
            <p role="status" className="text-muted-foreground text-xs">
              {currentBudget === 0
                ? 'Actual: sin presupuesto'
                : `Actual: ${formatCurrency(currentBudget)}`}
            </p>
          ) : null}
        </div>
        {/* Its own line rather than squeezed beside the label: at phone
            width the three of them turned "Presupuesto mensual" into two
            wrapped lines with the amount beside it. */}
        {months.length > 1 ? (
          <select
            aria-label="Mes del presupuesto"
            value={monthKey(selectedMonth)}
            onChange={(event) => {
              setSelectedKey(event.target.value)
              // The draft belonged to the month being left; the field has
              // to show what the newly picked month actually holds.
              setBudgetDraft(null)
              setSaved(null)
              setError(null)
            }}
            className="border-input bg-background h-11 w-full rounded-lg border px-3 text-sm"
          >
            {months.map((month) => (
              <option key={monthKey(month)} value={monthKey(month)}>
                {formatMonthLabel(month)}
              </option>
            ))}
          </select>
        ) : null}

        {/* The peso sign lives beside the field rather than inside its value:
            the raw number stays parseable, but the input stops reading as a
            bare "500000" next to amounts formatted everywhere else.
            FormattedAmountInput groups that same raw value live as it's
            typed ("500.000"), the same grouping formatCurrency renders it
            with once saved. */}
        <div className="relative">
          <span
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          >
            $
          </span>
          <FormattedAmountInput
            id="monthly-budget"
            name="monthly-budget"
            className="pl-7"
            value={amount}
            onChange={setBudgetDraft}
            autoComplete="off"
          />
        </div>
        {/* The budget is a decision about one month, not a setting that
            applies to all of history: what September was measured against
            has to stay what September was measured against. Saying which
            month this writes to is the only place the app can explain
            that. See lib/households/monthlyBudget. */}
        <p className="text-muted-foreground text-xs">
          Se guarda para {formatMonthLabel(selectedMonth)}. Los demás meses
          quedan con el presupuesto que tenían.
        </p>
      </div>

      {error !== null ? <AlertMessage>{error}</AlertMessage> : null}
      {saved !== null && error === null ? (
        // aria-live rather than role="status": the "Actual:" line above is
        // already this form's one status node, and a second would make
        // "the status" ambiguous to anything looking for it. This still
        // announces.
        <p
          aria-live="polite"
          className="bg-success-surface text-success rounded-2xl px-4 py-3 text-sm"
        >
          {saved}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={mutation.isPending}
        className="w-full lg:w-auto lg:self-end lg:px-8"
      >
        {mutation.isPending ? 'Guardando…' : 'Guardar'}
      </Button>
    </form>
  )
}
