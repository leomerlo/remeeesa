import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createHouseholdWithMembership, getHousehold } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { EditBudgetForm } from './EditBudgetForm'

async function renderEditBudgetForm(input: {
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
  renderWithProviders(<EditBudgetForm db={db} householdId={household.id} />)
  return { householdId: household.id, db }
}

async function submitBudget(value: string): Promise<void> {
  fireEvent.change(await screen.findByLabelText('Monthly budget'), {
    target: { value },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save budget' }))
}

describe('EditBudgetForm', () => {
  it('loads the current monthly budget into the form', async () => {
    await renderEditBudgetForm({ monthlyBudget: 100 })

    await waitFor(() => {
      expect(screen.getByLabelText('Monthly budget')).toHaveValue('100')
    })
  })

  it('shows the updated budget after a member submits a new amount', async () => {
    const { householdId, db } = await renderEditBudgetForm({
      monthlyBudget: 100,
    })

    expect(await screen.findByRole('status')).toHaveTextContent('100')
    await submitBudget('250')

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('250')
    })
    await expect(getHousehold({ db, householdId })).resolves.toMatchObject({
      monthlyBudget: 250,
    })
  })

  it('rejects a zero budget and leaves the stored amount unchanged', async () => {
    const { householdId, db } = await renderEditBudgetForm({
      monthlyBudget: 100,
    })

    expect(await screen.findByRole('status')).toHaveTextContent('100')
    await submitBudget('0')

    expect(screen.getByRole('alert')).toHaveTextContent(/budget/i)
    expect(screen.getByRole('status')).toHaveTextContent('100')
    await expect(getHousehold({ db, householdId })).resolves.toMatchObject({
      monthlyBudget: 100,
    })
  })

  it('rejects a negative budget and leaves the stored amount unchanged', async () => {
    const { householdId, db } = await renderEditBudgetForm({
      monthlyBudget: 100,
    })

    expect(await screen.findByRole('status')).toHaveTextContent('100')
    await submitBudget('-12')

    expect(screen.getByRole('alert')).toHaveTextContent(/budget/i)
    expect(screen.getByRole('status')).toHaveTextContent('100')
    await expect(getHousehold({ db, householdId })).resolves.toMatchObject({
      monthlyBudget: 100,
    })
  })

  it('rejects a non-numeric budget and leaves the stored amount unchanged', async () => {
    const { householdId, db } = await renderEditBudgetForm({
      monthlyBudget: 100,
    })

    expect(await screen.findByRole('status')).toHaveTextContent('100')
    await submitBudget('abc')

    expect(screen.getByRole('alert')).toHaveTextContent(/budget/i)
    expect(screen.getByRole('status')).toHaveTextContent('100')
    await expect(getHousehold({ db, householdId })).resolves.toMatchObject({
      monthlyBudget: 100,
    })
  })

  it('accepts a decimal budget and shows the updated amount', async () => {
    const { householdId, db } = await renderEditBudgetForm({
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
})
