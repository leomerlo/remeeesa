type FirebaseErrorLike = {
  readonly code?: string
  readonly message?: string
  readonly name?: string
  readonly customData?: unknown
  readonly stack?: string
}

function toFirebaseErrorDetails(error: unknown): FirebaseErrorLike {
  if (typeof error !== 'object' || error === null) {
    return { message: String(error) }
  }
  const record = error as FirebaseErrorLike
  return {
    code: record.code,
    message: record.message,
    name: record.name,
    customData: record.customData,
    stack: record.stack,
  }
}

/** Logs Firebase/Firestore errors in dev. No-op in production builds. */
export function logFirebaseError(
  error: unknown,
  context?: string,
  details?: Record<string, unknown>,
): void {
  if (!import.meta.env.DEV) {
    return
  }
  const label = context ?? 'Firestore operation'
  console.error(
    `[remeeesa:firebase] ${label} failed`,
    toFirebaseErrorDetails(error),
    details ?? {},
  )
}
