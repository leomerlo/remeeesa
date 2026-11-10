export function cardsQueryKey(input: {
  readonly householdId: string
}): readonly ['household-cards', string] {
  return ['household-cards', input.householdId]
}
