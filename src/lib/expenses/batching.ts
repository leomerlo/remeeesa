// Firestore refuses a write batch of more than 500 operations. Renaming or
// merging a category has to touch every Expense and Pendiente that references it,
// which in a household with years of history is easily more than that, so the
// writes are split into batches this helper hands out.
//
// The limit is kept under Firestore's own so a caller that appends one more
// write to the final batch can never tip it over.
export const WRITE_BATCH_LIMIT = 400

export function chunkForWriteBatch<T>(
  items: readonly T[],
  limit: number = WRITE_BATCH_LIMIT,
): readonly (readonly T[])[] {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('El tamaño del lote debe ser un entero positivo')
  }
  const chunks: (readonly T[])[] = []
  for (let start = 0; start < items.length; start += limit) {
    chunks.push(items.slice(start, start + limit))
  }
  return chunks
}
