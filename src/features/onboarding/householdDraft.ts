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
    return { ok: false, error: 'Ingresá un nombre para el hogar' }
  }

  // Left blank on purpose is fine -- see parseMonthlyBudget. Number('') is
  // 0, which is exactly the "sin presupuesto" value, so a blank field needs
  // no special case here; only a negative or unparseable one is rejected.
  const monthlyBudget = Number(input.monthlyBudget.trim())
  if (!Number.isFinite(monthlyBudget) || monthlyBudget < 0) {
    return { ok: false, error: 'El presupuesto no puede ser negativo' }
  }

  return {
    ok: true,
    draft: { name, monthlyBudget },
  }
}
