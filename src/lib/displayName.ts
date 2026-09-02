// The name a member is shown as: their Google display name, else the local
// part of their email, else a generic word. Lived as a private copy in
// HomePage and PendientesPage; Ajustes needing it too made three copies, which
// is where "tolerate the duplication" stops paying.
export function authorDisplayNameFromAuth(
  user:
    | {
        readonly displayName?: string | null
        readonly email?: string | null
      }
    | null
    | undefined,
): string {
  const displayName = user?.displayName?.trim()
  if (displayName !== undefined && displayName !== '') {
    return displayName
  }
  const email = user?.email?.trim()
  if (email !== undefined && email !== '') {
    const localPart = email.split('@')[0]?.trim()
    if (localPart !== undefined && localPart !== '') {
      return localPart
    }
  }
  return 'Miembro'
}
