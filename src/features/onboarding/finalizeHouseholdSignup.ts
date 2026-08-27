import { createHouseholdWithMembership } from '@/lib/households'
import type { Household, HouseholdsDb } from '@/lib/households'
import type { HouseholdDraft } from './householdDraft'

export async function finalizeHouseholdSignup(input: {
  readonly db: HouseholdsDb
  readonly userId: string
  readonly draft: HouseholdDraft | null
}): Promise<Household | null> {
  if (input.draft === null) {
    return null
  }

  return createHouseholdWithMembership({
    db: input.db,
    userId: input.userId,
    name: input.draft.name,
    monthlyBudget: input.draft.monthlyBudget,
  })
}
