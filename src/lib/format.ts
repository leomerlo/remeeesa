// Shared across features that render a date as a short label (expenses,
// pendientes) -- kept here instead of duplicated per feature.
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// "Septiembre de 2026" -- the label a card or section header uses to say
// which month a figure belongs to. es-AR renders the month lowercase
// ("septiembre de 2026"); callers that put this at the start of a sentence
// or as its own label want it capitalized.
export function formatMonthLabel(date: Date): string {
  const label = date.toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
