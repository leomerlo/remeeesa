import { describe, expect, it } from 'vitest'
import {
  createHouseholdWithMembership,
  HouseholdAccessDeniedError,
} from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { CardNameTakenError, createCard, listCards } from './cards'

async function setup() {
  const memory = createMemoryHouseholdsDb()
  const db = memory.asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa',
    monthlyBudget: 100,
  })
  return { memory, db, householdId: household.id }
}

describe('createCard', () => {
  it('stores the trimmed name', async () => {
    const { db, householdId } = await setup()

    const card = await createCard({ db, householdId, name: '  Visa  ' })

    expect(card.name).toBe('Visa')
    expect(await listCards({ db, householdId })).toEqual([card])
  })

  it('rejects a blank name and creates nothing', async () => {
    const { db, householdId } = await setup()

    await expect(createCard({ db, householdId, name: '   ' })).rejects.toThrow(
      'Ingresá un nombre para la tarjeta',
    )
    expect(await listCards({ db, householdId })).toEqual([])
  })

  it('rejects a name that differs only in case from an existing card', async () => {
    const { db, householdId } = await setup()
    await createCard({ db, householdId, name: 'Visa' })

    await expect(
      createCard({ db, householdId, name: ' visa ' }),
    ).rejects.toBeInstanceOf(CardNameTakenError)
    expect(await listCards({ db, householdId })).toHaveLength(1)
  })

  it('allows the same name in another household', async () => {
    const { memory, db, householdId } = await setup()
    const other = memory.asUser('user-3')
    const otherHousehold = await createHouseholdWithMembership({
      db: other,
      userId: 'user-3',
      name: 'Otra',
      monthlyBudget: 100,
    })
    await createCard({ db, householdId, name: 'Visa' })

    const card = await createCard({
      db: other,
      householdId: otherHousehold.id,
      name: 'Visa',
    })

    expect(card.householdId).toBe(otherHousehold.id)
  })
})

describe('listCards', () => {
  it('returns cards sorted by name', async () => {
    const { db, householdId } = await setup()
    await createCard({ db, householdId, name: 'Visa' })
    await createCard({ db, householdId, name: 'Amex' })

    const names = (await listCards({ db, householdId })).map((c) => c.name)

    expect(names).toEqual(['Amex', 'Visa'])
  })

  it('shows every member of the household the same cards', async () => {
    const { memory, db, householdId } = await setup()
    memory.addMember({ userId: 'user-2', householdId })
    await createCard({ db, householdId, name: 'Visa' })

    const seenBySecond = await listCards({
      db: memory.asUser('user-2'),
      householdId,
    })

    expect(seenBySecond.map((c) => c.name)).toEqual(['Visa'])
  })

  it('denies someone outside the household', async () => {
    const { memory, db, householdId } = await setup()
    await createCard({ db, householdId, name: 'Visa' })

    await expect(
      listCards({ db: memory.asUser('outsider'), householdId }),
    ).rejects.toBeInstanceOf(HouseholdAccessDeniedError)
  })

  it('denies someone outside the household from creating a card', async () => {
    const { memory, householdId } = await setup()

    await expect(
      createCard({ db: memory.asUser('outsider'), householdId, name: 'Visa' }),
    ).rejects.toBeInstanceOf(HouseholdAccessDeniedError)
  })
})
