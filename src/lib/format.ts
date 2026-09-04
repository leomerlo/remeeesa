// "06/09/2026" -- every date in the app, on every screen and at every
// width. It started spelled out; at that length it wrapped onto two lines
// inside the narrower cards and pushed everything else around, so it is
// numeric. Zero-padded so a column of dates lines up.
export function formatDate(date: Date): string {
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
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
