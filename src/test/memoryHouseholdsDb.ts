import {
  AlreadyInHouseholdError,
  HouseholdAccessDeniedError,
  InviteNotFoundError,
} from '@/lib/households/households'
import type {
  Household,
  HouseholdInvite,
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

type InviteRecord = {
  householdId: string
  createdAt: Date
}

type MemoryState = {
  households: Map<string, HouseholdRecord>
  members: Map<string, MembershipRecord>
  invites: Map<string, InviteRecord>
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
    async getMembership(memberUserId) {
      if (memberUserId !== userId) {
        throw new HouseholdAccessDeniedError()
      }
      const membership = state.members.get(memberUserId)
      if (membership === undefined) {
        return null
      }
      return {
        householdId: membership.householdId,
        userId: memberUserId,
        joinedAt: membership.joinedAt,
      }
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
    async getOrCreateInvite(input) {
      assertMemberOf(state, userId, input.householdId)
      for (const [token, record] of state.invites) {
        if (record.householdId === input.householdId) {
          return {
            householdId: record.householdId,
            token,
            createdAt: record.createdAt,
          }
        }
      }
      const createdAt = new Date()
      const token = crypto.randomUUID()
      const invite: HouseholdInvite = {
        householdId: input.householdId,
        token,
        createdAt,
      }
      state.invites.set(token, {
        householdId: invite.householdId,
        createdAt: invite.createdAt,
      })
      return invite
    },
    async joinHousehold(input) {
      if (input.userId !== userId) {
        throw new HouseholdAccessDeniedError()
      }
      const invite = state.invites.get(input.token)
      if (invite === undefined) {
        throw new InviteNotFoundError()
      }
      const existing = state.members.get(input.userId)
      if (existing !== undefined) {
        if (existing.householdId === invite.householdId) {
          return {
            householdId: existing.householdId,
            userId: input.userId,
            joinedAt: existing.joinedAt,
          }
        }
        throw new AlreadyInHouseholdError()
      }
      const joinedAt = new Date()
      state.members.set(input.userId, {
        householdId: invite.householdId,
        joinedAt,
      })
      return {
        householdId: invite.householdId,
        userId: input.userId,
        joinedAt,
      }
    },
    async leaveHousehold(input) {
      if (input.userId !== userId) {
        throw new HouseholdAccessDeniedError()
      }
      state.members.delete(input.userId)
    },
  }
}

export function createMemoryHouseholdsDb(): {
  asUser(userId: string): HouseholdsDb
  seedMembership(input: {
    readonly userId: string
    readonly householdId: string
  }): void
  addMember(input: {
    readonly userId: string
    readonly householdId: string
  }): void
} {
  const state: MemoryState = {
    households: new Map(),
    members: new Map(),
    invites: new Map(),
  }

  return {
    asUser(actingUserId) {
      return dbForUser(state, actingUserId)
    },
    seedMembership(input) {
      if (!state.households.has(input.householdId)) {
        throw new Error('Household not found')
      }
      if (state.members.has(input.userId)) {
        throw new AlreadyInHouseholdError()
      }
      state.members.set(input.userId, {
        householdId: input.householdId,
        joinedAt: new Date(),
      })
    },
    addMember(input) {
      state.members.set(input.userId, {
        householdId: input.householdId,
        joinedAt: new Date(),
      })
    },
  }
}
