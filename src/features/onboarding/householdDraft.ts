export type HouseholdDraft = {
  readonly name: string
  readonly monthlyBudget: number
}

export type HouseholdDraftParseResult =
  | { readonly ok: true; readonly draft: HouseholdDraft }
  | { readonly ok: false; readonly error: string }

export function parseHouseholdDraft(input: {
  readonly name: string
  readonly monthlyBudget: string
}): HouseholdDraftParseResult {
  const name = input.name.trim()
  if (name === '') {
    return { ok: false, error: 'Enter a household name' }
  }

  const monthlyBudget = Number(input.monthlyBudget.trim())
  if (!Number.isFinite(monthlyBudget) || monthlyBudget <= 0) {
    return { ok: false, error: 'Enter a monthly budget greater than 0' }
  }

  return {
    ok: true,
    draft: { name, monthlyBudget },
  }
}
