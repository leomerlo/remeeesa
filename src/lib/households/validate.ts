export function parseHouseholdName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('El nombre del hogar no puede estar vacío')
  }
  return trimmed
}

// Zero means "sin presupuesto", and is allowed: a household can use the app
// as a plain running total of what it spent, and put a budget in later. The
// app is built around having one -- every screen counts down from it -- but
// not having one yet is a state, not an error. Per direct feedback.
export function parseMonthlyBudget(monthlyBudget: number): number {
  if (!Number.isFinite(monthlyBudget) || monthlyBudget < 0) {
    throw new Error('El presupuesto mensual no puede ser negativo')
  }
  return monthlyBudget
}

export function parseMemberDisplayName(displayName: string): string {
  const trimmed = displayName.trim()
  if (trimmed === '') {
    throw new Error('Ingresá un nombre')
  }
  return trimmed
}
