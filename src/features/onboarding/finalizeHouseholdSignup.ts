import { createHouseholdWithMembership } from '@/lib/households'
import type { Household, HouseholdsDb } from '@/lib/households'
import type { HouseholdDraft } from './householdDraft'

export async function finalizeHouseholdSignup(input: {
  readonly db: HouseholdsDb
  readonly userId: string
  readonly draft: HouseholdDraft | null
  // The founder's own name for the membership this creates -- e.g. their
  // Google display name or the local part of their email (see
  // authorDisplayNameFromAuth). Optional: falls back to a generic label,
  // same as every other createHouseholdWithMembership caller that doesn't
  // have a real name on hand.
  readonly displayName?: string
}): Promise<Household | null> {
  if (input.draft === null) {
    return null
  }

  return createHouseholdWithMembership({
    db: input.db,
    userId: input.userId,
    name: input.draft.name,
    monthlyBudget: input.draft.monthlyBudget,
    ...(input.displayName === undefined
      ? {}
      : { displayName: input.displayName }),
  })
}
