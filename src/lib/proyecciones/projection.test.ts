import { describe, expect, it } from 'vitest'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { parseProjectionDocument } from './converters'
import { projectionIdFor } from './types'

async function setup() {
  const memory = createMemoryHouseholdsDb()
  const db = memory.asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa',
    monthlyBudget: 1000,
  })
  return { memory, db, householdId: household.id }
}

const OCTOBER = new Date(2026, 9, 1)

describe('projectionIdFor', () => {
  // One document per household per month, so two members editing the same
  // month land on the same one rather than each building their own.
  it('is the same id for the same household and month', () => {
    expect(projectionIdFor('h-1', OCTOBER)).toBe(
      projectionIdFor('h-1', new Date(2026, 9, 28)),
    )
  })

  it('differs by month and by household', () => {
    expect(projectionIdFor('h-1', OCTOBER)).not.toBe(
      projectionIdFor('h-1', new Date(2026, 10, 1)),
    )
    expect(projectionIdFor('h-1', OCTOBER)).not.toBe(
      projectionIdFor('h-2', OCTOBER),
    )
  })

  it('pads the month, so the id sorts in calendar order', () => {
    expect(projectionIdFor('h-1', new Date(2026, 2, 1))).toBe('h-1_2026-03')
  })
})

describe('a household projection', () => {
  it('is absent until somebody edits the month', async () => {
    const { db, householdId } = await setup()

    expect(
      await db.getProjection({ householdId, monthStart: OCTOBER }),
    ).toBeNull()
  })

  // The point of moving this off the device: what one member builds is what
  // the other one opens.
  it('is read back by another member of the same household', async () => {
    const { memory, db, householdId } = await setup()
    const invite = await db.getOrCreateInvite({ householdId })
    await memory.asUser('user-2').joinHousehold({
      userId: 'user-2',
      token: invite.token,
      displayName: 'Leo',
    })
    await db.saveProjection({
      householdId,
      monthStart: OCTOBER,
      excluded: ['comida'],
      overrides: { ropa: '12000' },
    })

    expect(
      await memory
        .asUser('user-2')
        .getProjection({ householdId, monthStart: OCTOBER }),
    ).toEqual({
      householdId,
      monthStart: OCTOBER,
      excluded: ['comida'],
      overrides: { ropa: '12000' },
    })
  })

  it('keeps each month apart', async () => {
    const { db, householdId } = await setup()
    await db.saveProjection({
      householdId,
      monthStart: OCTOBER,
      excluded: ['comida'],
      overrides: {},
    })

    expect(
      await db.getProjection({
        householdId,
        monthStart: new Date(2026, 10, 1),
      }),
    ).toBeNull()
  })

  // Last write wins: merging two scratchpads field by field would produce a
  // scenario neither member built.
  it('replaces the whole set of edits on every save', async () => {
    const { db, householdId } = await setup()
    await db.saveProjection({
      householdId,
      monthStart: OCTOBER,
      excluded: ['comida', 'ropa'],
      overrides: { ropa: '12000' },
    })
    await db.saveProjection({
      householdId,
      monthStart: OCTOBER,
      excluded: [],
      overrides: { salud: '900' },
    })

    expect(
      await db.getProjection({ householdId, monthStart: OCTOBER }),
    ).toMatchObject({ excluded: [], overrides: { salud: '900' } })
  })

  it('denies someone outside the household', async () => {
    const { memory, householdId } = await setup()

    await expect(
      memory
        .asUser('intruso')
        .getProjection({ householdId, monthStart: OCTOBER }),
    ).rejects.toThrow()
  })
})

describe('parseProjectionDocument', () => {
  const data = {
    household_id: 'h-1',
    month_start: new Date(2026, 9, 1, 12),
    excluded: ['comida'],
    overrides: { ropa: '12000' },
  }

  it('parses a valid document', () => {
    expect(parseProjectionDocument({ id: 'h-1_2026-10', data })).toEqual({
      householdId: 'h-1',
      monthStart: new Date(2026, 9, 1, 12),
      excluded: ['comida'],
      overrides: { ropa: '12000' },
    })
  })

  // A scratchpad is not worth taking a screen down for: anything of the
  // wrong type inside is dropped, never thrown.
  it('drops entries of the wrong type rather than failing', () => {
    expect(
      parseProjectionDocument({
        id: 'h-1_2026-10',
        data: { ...data, excluded: ['bueno', 7], overrides: { malo: 7 } },
      }),
    ).toMatchObject({ excluded: ['bueno'], overrides: {} })
  })

  it('reads a document with neither list as empty', () => {
    expect(
      parseProjectionDocument({
        id: 'h-1_2026-10',
        data: { household_id: 'h-1', month_start: new Date(2026, 9, 1, 12) },
      }),
    ).toMatchObject({ excluded: [], overrides: {} })
  })
})
