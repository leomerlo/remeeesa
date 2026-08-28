export function householdQueryKey(input: {
  readonly householdId: string
}): readonly ['household', string] {
  return ['household', input.householdId]
}
