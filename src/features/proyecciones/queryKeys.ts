// Keyed by month as well as household: paging to another month is a
// different document, not a refetch of the same one.
export function projectionQueryKey(input: {
  readonly householdId: string
  readonly monthStart: Date
}): readonly unknown[] {
  return ['projection', input.householdId, input.monthStart.getTime()]
}
