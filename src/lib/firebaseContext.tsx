import { createContext, useContext } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { AppFirebaseClient } from './firebase'

const FirebaseContext = createContext<AppFirebaseClient | null>(null)

type FirebaseProviderProps = {
  readonly client: AppFirebaseClient
  readonly children: ReactNode
}

export function FirebaseProvider({
  client,
  children,
}: FirebaseProviderProps): ReactElement {
  return (
    <FirebaseContext.Provider value={client}>
      {children}
    </FirebaseContext.Provider>
  )
}

export function useFirebase(): AppFirebaseClient {
  const client = useContext(FirebaseContext)

  if (client === null) {
    throw new Error('useFirebase must be used inside FirebaseProvider')
  }

  return client
}
