import type { AppFirebaseClient } from '@/lib/firebase'

// The only place a test double is cast to AppFirebaseClient. No test implements
// Auth or Firestore, so the cast is kept here where it is named and greppable
// rather than repeated in every test file.
export function createFirebaseStub(
  overrides: Partial<AppFirebaseClient> = {},
): AppFirebaseClient {
  return { ...overrides } as unknown as AppFirebaseClient
}
