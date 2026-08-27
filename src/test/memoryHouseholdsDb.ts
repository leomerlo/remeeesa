import {
  AlreadyInHouseholdError,
  HouseholdAccessDeniedError,
} from '@/lib/households/households'
import type {
  Household,
  HouseholdMember,
  HouseholdsDb,
} from '@/lib/households/types'

type HouseholdRecord = {
  name: string
  monthlyBudget: number
  createdAt: Date
}

type MembershipRecord = {
  householdId: string
  joinedAt: Date
}

type MemoryState = {
  households: Map<string, HouseholdRecord>
  members: Map<string, MembershipRecord>
}

function toHousehold(id: string, record: HouseholdRecord): Household {
  return {
    id,
    name: record.name,
    monthlyBudget: record.monthlyBudget,
    createdAt: record.createdAt,
  }
}

function assertMemberOf(
  state: MemoryState,
  userId: string,
  householdId: string,
): void {
  const membership = state.members.get(userId)
  if (membership === undefined || membership.householdId !== householdId) {
    throw new HouseholdAccessDeniedError()
  }
}

function dbForUser(state: MemoryState, userId: string): HouseholdsDb {
  return {
    async createHouseholdAndMembership(input) {
      if (input.userId !== userId) {
        throw new HouseholdAccessDeniedError()
      }
      if (state.members.has(input.userId)) {
        throw new AlreadyInHouseholdError()
      }
      const createdAt = new Date()
      const householdId = crypto.randomUUID()
      const household: Household = {
        id: householdId,
        name: input.name,
        monthlyBudget: input.monthlyBudget,
        createdAt,
      }
      const member: HouseholdMember = {
        householdId,
        userId: input.userId,
        joinedAt: createdAt,
      }
      state.households.set(householdId, {
        name: household.name,
        monthlyBudget: household.monthlyBudget,
        createdAt: household.createdAt,
      })
      state.members.set(input.userId, {
        householdId,
        joinedAt: member.joinedAt,
      })
      return { household, member }
    },
    async getHousehold(householdId) {
      assertMemberOf(state, userId, householdId)
      const record = state.households.get(householdId)
      if (record === undefined) {
        throw new Error('Household not found')
      }
      return toHousehold(householdId, record)
    },
    async listMembers(householdId) {
      assertMemberOf(state, userId, householdId)
      const members: HouseholdMember[] = []
      for (const [memberUserId, membership] of state.members) {
        if (membership.householdId === householdId) {
          members.push({
            householdId: membership.householdId,
            userId: memberUserId,
            joinedAt: membership.joinedAt,
          })
        }
      }
      return members
    },
    async updateMonthlyBudget(input) {
      assertMemberOf(state, userId, input.householdId)
      const record = state.households.get(input.householdId)
      if (record === undefined) {
        throw new Error('Household not found')
      }
      const updated: Household = {
        id: input.householdId,
        name: record.name,
        monthlyBudget: input.monthlyBudget,
        createdAt: record.createdAt,
      }
      state.households.set(input.householdId, {
        name: updated.name,
        monthlyBudget: updated.monthlyBudget,
        createdAt: updated.createdAt,
      })
      return updated
    },
  }
}

export function createMemoryHouseholdsDb(): {
  asUser(userId: string): HouseholdsDb
} {
  const state: MemoryState = {
    households: new Map(),
    members: new Map(),
  }

  return {
    asUser(actingUserId) {
      return dbForUser(state, actingUserId)
    },
  }
}
