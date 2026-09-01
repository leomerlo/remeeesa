// Shared between AddCuentaForm's post-create invalidation and
// PendingCuentasList's query -- creating a Cuenta refreshes the list
// automatically through this key.
export function cuentasQueryKey(input: {
  readonly householdId: string
}): readonly ['cuentas', string] {
  return ['cuentas', input.householdId]
}
