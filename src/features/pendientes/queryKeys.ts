// Shared between AddPendienteForm's post-create invalidation and
// PendientesList's query -- creating a Pendiente refreshes the list
// automatically through this key.
export function pendientesQueryKey(input: {
  readonly householdId: string
}): readonly ['pendientes', string] {
  return ['pendientes', input.householdId]
}
