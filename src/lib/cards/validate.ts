export function parseCardName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('Ingresá un nombre para la tarjeta')
  }
  return trimmed
}
