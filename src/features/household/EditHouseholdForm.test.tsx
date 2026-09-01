import { useQuery } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { createHouseholdWithMembership, getHousehold } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { EditHouseholdForm } from './EditHouseholdForm'
import { householdQueryKey } from './householdQueryKey'

async function renderEditHouseholdForm(input: {
  readonly monthlyBudget: number
}): Promise<{
  readonly householdId: string
  readonly db: ReturnType<ReturnType<typeof createMemoryHouseholdsDb>['asUser']>
}> {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: input.monthlyBudget,
  })
  renderWithProviders(<EditHouseholdForm db={db} householdId={household.id} />)
  return { householdId: household.id, db }
}

async function submitBudget(value: string): Promise<void> {
  fireEvent.change(await screen.findByLabelText('Presupuesto mensual'), {
    target: { value },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
}

function SharedBudgetView(props: {
  readonly db: HouseholdsDb
  readonly householdId: string
}): ReactElement {
  const householdQuery = useQuery({
    queryKey: householdQueryKey({ householdId: props.householdId }),
    queryFn: () =>
      getHousehold({ db: props.db, householdId: props.householdId }),
  })
  if (householdQuery.data === undefined) {
    return <p>Loading shared budget</p>
  }

  return <p>{`Shared budget: ${String(householdQuery.data.monthlyBudget)}`}</p>
}

describe('EditHouseholdForm', () => {
  it('loads the current name and monthly budget into the form', async () => {
    await renderEditHouseholdForm({ monthlyBudget: 100 })

    await waitFor(() => {
      expect(screen.getByLabelText('Nombre del hogar')).toHaveValue('Casa Verde')
      expect(screen.getByLabelText('Presupuesto mensual')).toHaveValue('100')
    })
  })

  it('saves name and budget together', async () => {
    const { householdId, db } = await renderEditHouseholdForm({
      monthlyBudget: 100,
    })

    await waitFor(() => {
      expect(screen.getByLabelText('Nombre del hogar')).toHaveValue('Casa Verde')
      expect(screen.getByLabelText('Presupuesto mensual')).toHaveValue('100')
    })
    fireEvent.change(screen.getByLabelText('Nombre del hogar'), {
      target: { value: 'Casa Azul' },
    })
    fireEvent.change(screen.getByLabelText('Presupuesto mensual'), {
      target: { value: '250' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Nombre del hogar')).toHaveValue('Casa Azul')
      expect(screen.getByLabelText('Presupuesto mensual')).toHaveValue('250')
    })
    await expect(getHousehold({ db, householdId })).resolves.toMatchObject({
      name: 'Casa Azul',
      monthlyBudget: 250,
    })
  })

  it('rejects an empty name and leaves name and budget unchanged', async () => {
    const { householdId, db } = await renderEditHouseholdForm({
      monthlyBudget: 100,
    })

    await waitFor(() => {
      expect(screen.getByLabelText('Nombre del hogar')).toHaveValue('Casa Verde')
    })
    fireEvent.change(screen.getByLabelText('Nombre del hogar'), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByLabelText('Presupuesto mensual'), {
      target: { value: '250' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/nombre/i)
    await expect(getHousehold({ db, householdId })).resolves.toMatchObject({
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
  })

  it('shows the updated budget after a member submits a new amount', async () => {
    const { householdId, db } = await renderEditHouseholdForm({
      monthlyBudget: 100,
    })

    expect(await screen.findByRole('status')).toHaveTextContent('100')
    await submitBudget('250')

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('250')
    })
    expect(screen.getByLabelText('Presupuesto mensual')).toHaveValue('250')
    await expect(getHousehold({ db, householdId })).resolves.toMatchObject({
      monthlyBudget: 250,
    })
  })

  it('rejects a zero budget and leaves name and budget unchanged', async () => {
    const { householdId, db } = await renderEditHouseholdForm({
      monthlyBudget: 100,
    })

    fireEvent.change(await screen.findByLabelText('Nombre del hogar'), {
      target: { value: 'Casa Azul' },
    })
    expect(await screen.findByRole('status')).toHaveTextContent('100')
    await submitBudget('0')

    expect(screen.getByRole('alert')).toHaveTextContent(/presupuesto/i)
    expect(screen.getByRole('status')).toHaveTextContent('100')
    await expect(getHousehold({ db, householdId })).resolves.toMatchObject({
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
  })

  it('rejects a negative budget and leaves the stored amount unchanged', async () => {
    const { householdId, db } = await renderEditHouseholdForm({
      monthlyBudget: 100,
    })

    expect(await screen.findByRole('status')).toHaveTextContent('100')
    await submitBudget('-12')

    expect(screen.getByRole('alert')).toHaveTextContent(/presupuesto/i)
    expect(screen.getByRole('status')).toHaveTextContent('100')
    await expect(getHousehold({ db, householdId })).resolves.toMatchObject({
      monthlyBudget: 100,
    })
  })

  it('rejects a non-numeric budget and leaves the stored amount unchanged', async () => {
    const { householdId, db } = await renderEditHouseholdForm({
      monthlyBudget: 100,
    })

    expect(await screen.findByRole('status')).toHaveTextContent('100')
    await submitBudget('abc')

    expect(screen.getByRole('alert')).toHaveTextContent(/presupuesto/i)
    expect(screen.getByRole('status')).toHaveTextContent('100')
    await expect(getHousehold({ db, householdId })).resolves.toMatchObject({
      monthlyBudget: 100,
    })
  })

  it('rejects an empty budget and leaves the stored amount unchanged', async () => {
    const { householdId, db } = await renderEditHouseholdForm({
      monthlyBudget: 100,
    })

    expect(await screen.findByRole('status')).toHaveTextContent('100')
    await submitBudget('')

    expect(screen.getByRole('alert')).toHaveTextContent(/presupuesto/i)
    expect(screen.getByRole('status')).toHaveTextContent('100')
    await expect(getHousehold({ db, householdId })).resolves.toMatchObject({
      monthlyBudget: 100,
    })
  })

  it('rejects a whitespace-only budget and leaves the stored amount unchanged', async () => {
    const { householdId, db } = await renderEditHouseholdForm({
      monthlyBudget: 100,
    })

    expect(await screen.findByRole('status')).toHaveTextContent('100')
    await submitBudget('   ')

    expect(screen.getByRole('alert')).toHaveTextContent(/presupuesto/i)
    expect(screen.getByRole('status')).toHaveTextContent('100')
    await expect(getHousehold({ db, householdId })).resolves.toMatchObject({
      monthlyBudget: 100,
    })
  })

  it('accepts a decimal budget and shows the updated amount', async () => {
    const { householdId, db } = await renderEditHouseholdForm({
      monthlyBudget: 100,
    })

    expect(await screen.findByRole('status')).toHaveTextContent('100')
    await submitBudget('1200.50')

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('1200.5')
    })
    await expect(getHousehold({ db, householdId })).resolves.toMatchObject({
      monthlyBudget: 1200.5,
    })
  })

  it('accepts a very small decimal budget and shows the updated amount', async () => {
    const { householdId, db } = await renderEditHouseholdForm({
      monthlyBudget: 100,
    })

    expect(await screen.findByRole('status')).toHaveTextContent('100')
    await submitBudget('0.01')

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('0.01')
    })
    await expect(getHousehold({ db, householdId })).resolves.toMatchObject({
      monthlyBudget: 0.01,
    })
  })

  it('trims surrounding whitespace from a valid budget before saving', async () => {
    const { householdId, db } = await renderEditHouseholdForm({
      monthlyBudget: 100,
    })

    expect(await screen.findByRole('status')).toHaveTextContent('100')
    await submitBudget('  250  ')

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('250')
    })
    await expect(getHousehold({ db, householdId })).resolves.toMatchObject({
      monthlyBudget: 250,
    })
  })

  it('clears the error after a subsequent valid submit', async () => {
    await renderEditHouseholdForm({ monthlyBudget: 100 })

    expect(await screen.findByRole('status')).toHaveTextContent('100')
    await submitBudget('0')

    expect(screen.getByRole('alert')).toBeInTheDocument()

    await submitBudget('250')

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('status')).toHaveTextContent('250')
  })

  it('refetches so another view sharing the household query key shows the new budget', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    renderWithProviders(
      <>
        <EditHouseholdForm db={db} householdId={household.id} />
        <SharedBudgetView db={db} householdId={household.id} />
      </>,
    )

    expect(await screen.findByText('Shared budget: 100')).toBeInTheDocument()
    await submitBudget('250')

    await waitFor(() => {
      expect(screen.getByText('Shared budget: 250')).toBeInTheDocument()
    })
    expect(screen.getByRole('status')).toHaveTextContent('250')
  })
})
