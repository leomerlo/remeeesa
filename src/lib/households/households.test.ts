import { describe, expect, it } from 'vitest'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import {
  AlreadyInHouseholdError,
  createHouseholdWithMembership,
  getHousehold,
  HouseholdAccessDeniedError,
  leaveHousehold,
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
        name: '',
        monthlyBudget: 100,
      }),
    ).rejects.toThrow('Household name must be non-empty')
  })

  it('rejects a whitespace-only household name', async () => {
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
    ).rejects.toThrow(AlreadyInHouseholdError)
  })

  it('rejects creating a membership for a different user', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    await expect(
      createHouseholdWithMembership({
        db,
        userId: 'user-2',
        name: 'Casa Verde',
        monthlyBudget: 100,
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
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
    await expect(
      getHousehold({ db, householdId: household.id }),
    ).resolves.toEqual(updated)
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
    ).rejects.toThrow(HouseholdAccessDeniedError)

    await expect(
      listHouseholdMembers({ db: strangerDb, householdId: household.id }),
    ).rejects.toThrow(HouseholdAccessDeniedError)

    await expect(
      updateHouseholdBudget({
        db: strangerDb,
        householdId: household.id,
        monthlyBudget: 50,
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })

  it('does not let a member of another household access this one', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const otherDb = store.asUser('user-2')

    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    await createHouseholdWithMembership({
      db: otherDb,
      userId: 'user-2',
      name: 'Casa Azul',
      monthlyBudget: 200,
    })

    await expect(
      getHousehold({ db: otherDb, householdId: household.id }),
    ).rejects.toThrow(HouseholdAccessDeniedError)

    await expect(
      listHouseholdMembers({ db: otherDb, householdId: household.id }),
    ).rejects.toThrow(HouseholdAccessDeniedError)

    await expect(
      updateHouseholdBudget({
        db: otherDb,
        householdId: household.id,
        monthlyBudget: 50,
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
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

describe('leaveHousehold', () => {
  it('lets the same user create a household after leaving', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    await leaveHousehold({ db, userId: 'user-1' })

    const next = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Azul',
      monthlyBudget: 200,
    })

    expect(next.name).toBe('Casa Azul')
  })

  it('keeps the household and remaining members after someone leaves', async () => {
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

    await leaveHousehold({ db: leaverDb, userId: 'user-1' })

    await expect(
      getHousehold({ db: remainingDb, householdId: household.id }),
    ).resolves.toEqual(household)

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

  it('does nothing when the caller is not a member', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    await expect(
      leaveHousehold({ db, userId: 'user-1' }),
    ).resolves.toBeUndefined()
  })
})
