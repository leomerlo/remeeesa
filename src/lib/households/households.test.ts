import { describe, expect, it } from 'vitest'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import {
  AlreadyInHouseholdError,
  createHouseholdWithMembership,
  getHousehold,
  getOrCreateHouseholdInvite,
  HouseholdAccessDeniedError,
  InviteNotFoundError,
  joinHousehold,
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

describe('getOrCreateHouseholdInvite', () => {
  it('creates an invite token for a household member', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    const invite = await getOrCreateHouseholdInvite({
      db,
      householdId: household.id,
    })

    expect(invite).toEqual({
      householdId: household.id,
      token: expect.any(String),
      createdAt: expect.any(Date),
    })
    expect(invite.token.length).toBeGreaterThan(0)
    expect(invite).not.toHaveProperty('expiresAt')
    expect(invite).not.toHaveProperty('usedAt')
  })

  it('returns the same token when an invite already exists', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    const first = await getOrCreateHouseholdInvite({
      db,
      householdId: household.id,
    })
    const second = await getOrCreateHouseholdInvite({
      db,
      householdId: household.id,
    })

    expect(second).toEqual(first)
  })

  it('does not let a non-member generate an invite', async () => {
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
      getOrCreateHouseholdInvite({
        db: strangerDb,
        householdId: household.id,
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })

  it('returns the same token for every member of the household', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    store.seedMembership({ userId: 'user-2', householdId: household.id })

    const ownerInvite = await getOrCreateHouseholdInvite({
      db: ownerDb,
      householdId: household.id,
    })
    const memberInvite = await getOrCreateHouseholdInvite({
      db: store.asUser('user-2'),
      householdId: household.id,
    })

    expect(memberInvite).toEqual(ownerInvite)
  })

  it('gives each household its own invite token', async () => {
    const store = createMemoryHouseholdsDb()
    const firstHousehold = await createHouseholdWithMembership({
      db: store.asUser('user-1'),
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const secondHousehold = await createHouseholdWithMembership({
      db: store.asUser('user-2'),
      userId: 'user-2',
      name: 'Casa Azul',
      monthlyBudget: 200,
    })

    const firstInvite = await getOrCreateHouseholdInvite({
      db: store.asUser('user-1'),
      householdId: firstHousehold.id,
    })
    const secondInvite = await getOrCreateHouseholdInvite({
      db: store.asUser('user-2'),
      householdId: secondHousehold.id,
    })

    expect(firstInvite.token).not.toBe(secondInvite.token)
    expect(firstInvite.householdId).toBe(firstHousehold.id)
    expect(secondInvite.householdId).toBe(secondHousehold.id)
  })

  it('does not generate an invite for an empty household id', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    await expect(
      getOrCreateHouseholdInvite({ db, householdId: '' }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })
})

describe('joinHousehold', () => {
  it('adds the caller as a member of the invited household', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const invite = await getOrCreateHouseholdInvite({
      db: ownerDb,
      householdId: household.id,
    })
    const joinerDb = store.asUser('user-2')

    const member = await joinHousehold({
      db: joinerDb,
      userId: 'user-2',
      token: invite.token,
    })

    expect(member).toEqual({
      householdId: household.id,
      userId: 'user-2',
      joinedAt: expect.any(Date),
    })
    await expect(
      listHouseholdMembers({ db: joinerDb, householdId: household.id }),
    ).resolves.toEqual(
      expect.arrayContaining([
        {
          householdId: household.id,
          userId: 'user-1',
          joinedAt: expect.any(Date),
        },
        {
          householdId: household.id,
          userId: 'user-2',
          joinedAt: expect.any(Date),
        },
      ]),
    )
  })

  it('rejects a missing invite token', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const joinerDb = store.asUser('user-2')

    await expect(
      joinHousehold({
        db: joinerDb,
        userId: 'user-2',
        token: 'does-not-exist',
      }),
    ).rejects.toThrow(InviteNotFoundError)

    await expect(
      listHouseholdMembers({ db: ownerDb, householdId: household.id }),
    ).resolves.toEqual([
      {
        householdId: household.id,
        userId: 'user-1',
        joinedAt: expect.any(Date),
      },
    ])
  })

  it('rejects joining when the caller already has a membership', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const invite = await getOrCreateHouseholdInvite({
      db: ownerDb,
      householdId: household.id,
    })
    const otherDb = store.asUser('user-2')
    await createHouseholdWithMembership({
      db: otherDb,
      userId: 'user-2',
      name: 'Casa Azul',
      monthlyBudget: 200,
    })

    await expect(
      joinHousehold({
        db: otherDb,
        userId: 'user-2',
        token: invite.token,
      }),
    ).rejects.toThrow(AlreadyInHouseholdError)

    await expect(
      listHouseholdMembers({ db: ownerDb, householdId: household.id }),
    ).resolves.toEqual([
      {
        householdId: household.id,
        userId: 'user-1',
        joinedAt: expect.any(Date),
      },
    ])
  })

  it('returns the existing member when joining the same household again', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const invite = await getOrCreateHouseholdInvite({
      db: ownerDb,
      householdId: household.id,
    })
    const joinerDb = store.asUser('user-2')
    const first = await joinHousehold({
      db: joinerDb,
      userId: 'user-2',
      token: invite.token,
    })

    const second = await joinHousehold({
      db: joinerDb,
      userId: 'user-2',
      token: invite.token,
    })

    expect(second).toEqual(first)
    const members = await listHouseholdMembers({
      db: joinerDb,
      householdId: household.id,
    })
    expect(members.filter((member) => member.userId === 'user-2')).toHaveLength(
      1,
    )
  })

  it('rejects an empty invite token', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const joinerDb = store.asUser('user-2')

    await expect(
      joinHousehold({
        db: joinerDb,
        userId: 'user-2',
        token: '',
      }),
    ).rejects.toThrow(InviteNotFoundError)

    await expect(
      listHouseholdMembers({ db: ownerDb, householdId: household.id }),
    ).resolves.toEqual([
      {
        householdId: household.id,
        userId: 'user-1',
        joinedAt: expect.any(Date),
      },
    ])
  })

  it('lets a second visitor join with the same invite token', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const invite = await getOrCreateHouseholdInvite({
      db: ownerDb,
      householdId: household.id,
    })

    await joinHousehold({
      db: store.asUser('user-2'),
      userId: 'user-2',
      token: invite.token,
    })
    await joinHousehold({
      db: store.asUser('user-3'),
      userId: 'user-3',
      token: invite.token,
    })

    await expect(
      listHouseholdMembers({ db: ownerDb, householdId: household.id }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'user-1' }),
        expect.objectContaining({ userId: 'user-2' }),
        expect.objectContaining({ userId: 'user-3' }),
      ]),
    )
  })

  it('rejects joining as a different user than the caller', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const invite = await getOrCreateHouseholdInvite({
      db: ownerDb,
      householdId: household.id,
    })
    const joinerDb = store.asUser('user-2')

    await expect(
      joinHousehold({
        db: joinerDb,
        userId: 'user-3',
        token: invite.token,
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)

    await expect(
      listHouseholdMembers({ db: ownerDb, householdId: household.id }),
    ).resolves.toEqual([
      {
        householdId: household.id,
        userId: 'user-1',
        joinedAt: expect.any(Date),
      },
    ])
  })

  it('lets a user create a household after someone else joined via invite', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const invite = await getOrCreateHouseholdInvite({
      db: ownerDb,
      householdId: household.id,
    })
    await joinHousehold({
      db: store.asUser('user-2'),
      userId: 'user-2',
      token: invite.token,
    })

    const founded = await createHouseholdWithMembership({
      db: store.asUser('user-3'),
      userId: 'user-3',
      name: 'Casa Azul',
      monthlyBudget: 200,
    })

    expect(founded.id).not.toBe(household.id)
    await expect(
      listHouseholdMembers({
        db: store.asUser('user-3'),
        householdId: founded.id,
      }),
    ).resolves.toEqual([
      {
        householdId: founded.id,
        userId: 'user-3',
        joinedAt: expect.any(Date),
      },
    ])
  })
})
