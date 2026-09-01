// Used now only for invalidation after create -- there's no reader of this
// key yet (the pending-Cuentas list is a later ticket, #75).
export function cuentasQueryKey(input: {
  readonly householdId: string
}): readonly ['cuentas', string] {
  return ['cuentas', input.householdId]
}
