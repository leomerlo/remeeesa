import { describe, expect, it } from 'vitest'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import {
  createHouseholdWithMembership,
  getHousehold,
  listHouseholdMembers,
  updateHouseholdBudget,
} from './households'

describe('createHouseholdWithMembership', () => {
  it('creates a household with a valid name and positive budget', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 1500.5,
    })

    expect(household).toEqual({
      id: expect.any(String),
      name: 'Casa Verde',
      monthlyBudget: 1500.5,
      createdAt: expect.any(Date),
    })
    expect(household.id.length).toBeGreaterThan(0)
  })

  it('trims surrounding whitespace from the household name', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: '  Casa Verde  ',
      monthlyBudget: 100,
    })

    expect(household.name).toBe('Casa Verde')
  })

  it('rejects an empty household name', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    await expect(
      createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: '   ',
        monthlyBudget: 100,
      }),
    ).rejects.toThrow('Household name must be non-empty')
  })

  it('rejects a non-positive monthly budget', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    await expect(
      createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Casa Verde',
        monthlyBudget: 0,
      }),
    ).rejects.toThrow('Monthly budget must be a positive number')
  })

  it('rejects a negative monthly budget', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    await expect(
      createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Casa Verde',
        monthlyBudget: -10,
      }),
    ).rejects.toThrow('Monthly budget must be a positive number')
  })

  it('rejects a second membership for the same user', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    await expect(
      createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Other House',
        monthlyBudget: 200,
      }),
    ).rejects.toThrow('User already belongs to a household')
  })

  it('allows a different user to create their own household', async () => {
    const store = createMemoryHouseholdsDb()

    const first = await createHouseholdWithMembership({
      db: store.asUser('user-1'),
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const second = await createHouseholdWithMembership({
      db: store.asUser('user-2'),
      userId: 'user-2',
      name: 'Casa Azul',
      monthlyBudget: 200,
    })

    expect(first.id).not.toBe(second.id)
  })
})

describe('updateHouseholdBudget', () => {
  it('lets a member update the household monthly budget', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    const updated = await updateHouseholdBudget({
      db,
      householdId: household.id,
      monthlyBudget: 250.75,
    })

    expect(updated).toEqual({
      ...household,
      monthlyBudget: 250.75,
    })
  })

  it('rejects a non-positive monthly budget', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    await expect(
      updateHouseholdBudget({
        db,
        householdId: household.id,
        monthlyBudget: 0,
      }),
    ).rejects.toThrow('Monthly budget must be a positive number')
  })
})

describe('household member access', () => {
  it('does not let a non-member read or update the household', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const strangerDb = store.asUser('user-2')

    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    await expect(
      getHousehold({ db: strangerDb, householdId: household.id }),
    ).rejects.toThrow('Only household members can access this household')

    await expect(
      listHouseholdMembers({ db: strangerDb, householdId: household.id }),
    ).rejects.toThrow('Only household members can access this household')

    await expect(
      updateHouseholdBudget({
        db: strangerDb,
        householdId: household.id,
        monthlyBudget: 50,
      }),
    ).rejects.toThrow('Only household members can access this household')
  })

  it('lets a member read the household and its members list', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    await expect(
      getHousehold({ db, householdId: household.id }),
    ).resolves.toEqual(household)

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
})
