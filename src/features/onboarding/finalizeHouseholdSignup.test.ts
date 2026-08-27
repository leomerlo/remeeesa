import { describe, expect, it, vi } from 'vitest'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import {
  createHouseholdWithMembership,
  listHouseholdMembers,
} from '@/lib/households'
import { finalizeHouseholdSignup } from './finalizeHouseholdSignup'

describe('finalizeHouseholdSignup', () => {
  it('creates a household and equal membership from the draft', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    const household = await finalizeHouseholdSignup({
      db,
      userId: 'user-1',
      draft: { name: 'The Smiths', monthlyBudget: 1500 },
    })

    if (household === null) {
      throw new Error('expected a household')
    }

    expect(household).toEqual({
      id: expect.any(String),
      name: 'The Smiths',
      monthlyBudget: 1500,
      createdAt: expect.any(Date),
    })
    await expect(
      listHouseholdMembers({ db, householdId: household.id }),
    ).resolves.toEqual([
      {
        householdId: household.id,
        userId: 'user-1',
        joinedAt: expect.any(Date),
      },
    ])
  })

  it('does not write a household when there is no draft', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const createSpy = vi.spyOn(db, 'createHouseholdAndMembership')

    await expect(
      finalizeHouseholdSignup({
        db,
        userId: 'user-1',
        draft: null,
      }),
    ).resolves.toBeNull()

    expect(createSpy).not.toHaveBeenCalled()
    await expect(
      createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Later house',
        monthlyBudget: 100,
      }),
    ).resolves.toMatchObject({ name: 'Later house' })
  })

  it('does not write again when called later with a cleared draft', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await finalizeHouseholdSignup({
      db,
      userId: 'user-1',
      draft: { name: 'The Smiths', monthlyBudget: 1500 },
    })
    if (household === null) {
      throw new Error('expected a household')
    }

    await expect(
      finalizeHouseholdSignup({
        db,
        userId: 'user-1',
        draft: null,
      }),
    ).resolves.toBeNull()

    await expect(
      listHouseholdMembers({ db, householdId: household.id }),
    ).resolves.toHaveLength(1)
  })
})
