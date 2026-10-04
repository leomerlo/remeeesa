// What the household has done to a month's projection by hand: rows switched
// off, and amounts typed over the ones the figures suggested.
//
// A projection belongs to the household, not to whoever opened the screen --
// per direct feedback, "es una proyección de la casa". So it lives in
// Firestore beside everything else the two of them share, one document per
// household per month, rather than in the browser that typed it.
export type Projection = {
  readonly householdId: string
  // First day of the month this projection is for.
  readonly monthStart: Date
  // Row keys switched off. A key is a category id, or `servicio-{id}` for a
  // still-unpaid bill -- see ProyeccionesPage, which owns the shape.
  readonly excluded: readonly string[]
  // Edited amounts by row key, kept as the raw string the input holds so a
  // half-typed "12." survives a round trip.
  readonly overrides: Readonly<Record<string, string>>
}

export const EMPTY_PROJECTION_EDITS = {
  excluded: [] as readonly string[],
  overrides: {} as Readonly<Record<string, string>>,
}

// Deterministic, so a save can write the document without having to look it
// up first and so two members editing the same month land on one document.
export function projectionIdFor(householdId: string, monthStart: Date): string {
  const month = String(monthStart.getMonth() + 1).padStart(2, '0')
  return `${householdId}_${String(monthStart.getFullYear())}-${month}`
}
