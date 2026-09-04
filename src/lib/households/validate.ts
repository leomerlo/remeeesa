export function parseHouseholdName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('El nombre del hogar no puede estar vacío')
  }
  return trimmed
}

export function parseMonthlyBudget(monthlyBudget: number): number {
  if (!Number.isFinite(monthlyBudget) || monthlyBudget <= 0) {
    throw new Error('El presupuesto mensual debe ser un número positivo')
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
