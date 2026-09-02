// Shared across features that render a date as a short label (expenses,
// pendientes) -- kept here instead of duplicated per feature.
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
