export function parseHouseholdName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('Household name must be non-empty')
  }
  return trimmed
}

export function parseMonthlyBudget(monthlyBudget: number): number {
  if (!Number.isFinite(monthlyBudget) || monthlyBudget <= 0) {
    throw new Error('Monthly budget must be a positive number')
  }
  return monthlyBudget
}
