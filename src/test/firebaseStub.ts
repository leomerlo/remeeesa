import type { AppFirebaseClient } from '@/lib/firebase'

type FirebaseAuthStub = {
  readonly currentUser?: { readonly uid: string } | null
  onAuthStateChanged?(
    next: (user: { readonly uid: string } | null) => void,
  ): () => void
}

// The only place a test double is cast to AppFirebaseClient. No test implements
// Auth or Firestore, so the cast is kept here where it is named and greppable
// rather than repeated in every test file.
export function createFirebaseStub(
  overrides: {
    readonly auth?: FirebaseAuthStub
    readonly db?: AppFirebaseClient['db']
    readonly app?: AppFirebaseClient['app']
  } = {},
): AppFirebaseClient {
  return { ...overrides } as unknown as AppFirebaseClient
}
