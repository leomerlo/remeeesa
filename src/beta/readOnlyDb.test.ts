import { describe, expect, it } from 'vitest'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { READ_ONLY_METHODS, ReadOnlyDbError, readOnlyDb } from './readOnlyDb'

function makeDb() {
  return createMemoryHouseholdsDb().asUser('u1')
}

function methodNames(db: object): readonly string[] {
  return Object.keys(db).filter(
    (key) => typeof (db as Record<string, unknown>)[key] === 'function',
  )
}

describe('readOnlyDb', () => {
  it('lets a read through to the real database', async () => {
    const real = makeDb()
    const { household } = await real.createHouseholdAndMembership({
      userId: 'u1',
      name: 'Nuestra casa',
      monthlyBudget: 0,
      displayName: 'Flor',
    })

    await expect(
      readOnlyDb(real).getHousehold(household.id),
    ).resolves.toMatchObject({ name: 'Nuestra casa' })
  })

  it('refuses a write, naming the method', () => {
    const guarded = readOnlyDb(makeDb())

    expect(() =>
      guarded.deleteExpense({ householdId: 'h1', expenseId: 'e1' }),
    ).toThrow(ReadOnlyDbError)
    expect(() =>
      guarded.deleteExpense({ householdId: 'h1', expenseId: 'e1' }),
    ).toThrow(/deleteExpense/)
  })

  // The two a name-shaped rule would have waved through: both create the
  // thing when it is missing.
  it.each(['findOrCreateCategory', 'getOrCreateInvite'] as const)(
    'refuses %s, which writes despite its name',
    (method) => {
      const guarded = readOnlyDb(makeDb()) as unknown as Record<
        string,
        () => unknown
      >

      expect(() => guarded[method]?.()).toThrow(ReadOnlyDbError)
    },
  )

  it('refuses every method that is not on the allowlist', () => {
    const real = makeDb()
    const guarded = readOnlyDb(real) as unknown as Record<string, () => unknown>
    const allowed = new Set<string>(READ_ONLY_METHODS)
    const blocked = methodNames(real).filter((name) => !allowed.has(name))

    expect(blocked.length).toBeGreaterThan(20)
    for (const name of blocked) {
      expect(() => guarded[name]?.()).toThrow(ReadOnlyDbError)
    }
  })

  // Guards the allowlist itself: a typo would quietly block a read, and an
  // entry for a method that no longer exists would linger unnoticed.
  it('names only methods the database actually has', () => {
    const existing = new Set(methodNames(makeDb()))

    for (const method of READ_ONLY_METHODS) {
      expect(existing).toContain(method)
    }
  })
})
