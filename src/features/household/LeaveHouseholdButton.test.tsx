import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  createHouseholdWithMembership,
  getHousehold,
  listHouseholdMembers,
} from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { LeaveHouseholdButton } from './LeaveHouseholdButton'

describe('LeaveHouseholdButton', () => {
  it('leaves the household when clicked', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(<LeaveHouseholdButton db={db} userId="user-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Leave household' }))

    await waitFor(async () => {
      const next = await createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Casa Azul',
        monthlyBudget: 200,
      })
      expect(next.name).toBe('Casa Azul')
    })
  })

  it('does not delete the household or remaining members', async () => {
    const store = createMemoryHouseholdsDb()
    const leaverDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: leaverDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    store.addMember({ userId: 'user-2', householdId: household.id })
    const remainingDb = store.asUser('user-2')

    renderWithProviders(<LeaveHouseholdButton db={leaverDb} userId="user-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Leave household' }))

    await waitFor(async () => {
      await expect(
        getHousehold({ db: remainingDb, householdId: household.id }),
      ).resolves.toEqual(household)
    })

    await expect(
      listHouseholdMembers({ db: remainingDb, householdId: household.id }),
    ).resolves.toEqual([
      {
        householdId: household.id,
        userId: 'user-2',
        joinedAt: expect.any(Date),
      },
    ])
  })
})
