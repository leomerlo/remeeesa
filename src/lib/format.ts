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

// A bill's due date, said as a sentence rather than left as a bare number:
// "Vence el 06/09/2026" while it is still ahead, "Venció el 06/09/2026"
// once the day has passed with nothing paid. Per direct feedback -- a date
// on its own does not say which of the two it is, and those are opposite
// situations.
//
// Compared at day granularity: a bill due today has not been missed.
export function isOverdue(dueDate: Date, now: Date = new Date()): boolean {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return dueDate.getTime() < today.getTime()
}

export function dueDateLabel(dueDate: Date, now: Date = new Date()): string {
  return `${isOverdue(dueDate, now) ? 'Venció' : 'Vence'} el ${formatDate(dueDate)}`
}

// The other half of the pair, for money that has already left: a settled
// bill, or any expense in the history.
export function paidDateLabel(date: Date): string {
  return `Pagado el ${formatDate(date)}`
}
