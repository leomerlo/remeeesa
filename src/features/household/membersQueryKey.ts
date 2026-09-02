export function membersQueryKey(input: {
  readonly householdId: string
}): readonly ['household-members', string] {
  return ['household-members', input.householdId]
}
