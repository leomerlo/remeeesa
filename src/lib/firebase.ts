import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import type { FirebaseApp } from 'firebase/app'
import type { Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'

export type AppFirebaseClient = {
  readonly app: FirebaseApp
  readonly auth: Auth
  readonly db: Firestore
}

export type FirebaseEnv = {
  readonly apiKey: string
  readonly authDomain: string
  readonly projectId: string
  readonly appId: string
}

const API_KEY = 'VITE_FIREBASE_API_KEY'
const AUTH_DOMAIN = 'VITE_FIREBASE_AUTH_DOMAIN'
const PROJECT_ID = 'VITE_FIREBASE_PROJECT_ID'
const APP_ID = 'VITE_FIREBASE_APP_ID'

function readRequiredString(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key]
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function readFirebaseEnv(source: Record<string, unknown>): FirebaseEnv {
  const apiKey = readRequiredString(source, API_KEY)
  const authDomain = readRequiredString(source, AUTH_DOMAIN)
  const projectId = readRequiredString(source, PROJECT_ID)
  const appId = readRequiredString(source, APP_ID)

  if (
    apiKey === null ||
    authDomain === null ||
    projectId === null ||
    appId === null
  ) {
    const invalid = [
      apiKey === null ? API_KEY : null,
      authDomain === null ? AUTH_DOMAIN : null,
      projectId === null ? PROJECT_ID : null,
      appId === null ? APP_ID : null,
    ].filter((key) => key !== null)

    throw new Error(
      `Missing or empty Firebase environment variables: ${invalid.join(', ')}`,
    )
  }

  return { apiKey, authDomain, projectId, appId }
}

export function createFirebaseClient(env: FirebaseEnv): AppFirebaseClient {
  const app = initializeApp(
    {
      apiKey: env.apiKey,
      authDomain: env.authDomain,
      projectId: env.projectId,
      appId: env.appId,
    },
    crypto.randomUUID(),
  )

  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  }
}
