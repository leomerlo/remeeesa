import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
} from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
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

export const FIREBASE_APP_NAME = 'remeeesa'

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

// Ports from firebase.json. Only ever reached when the app is told to use
// the emulators, which production never is -- see createFirebaseClient.
const EMULATOR_HOST = '127.0.0.1'
const FIRESTORE_EMULATOR_PORT = 8080
const AUTH_EMULATOR_PORT = 9099

export function createFirebaseClient(
  env: FirebaseEnv,
  options?: {
    readonly appName?: string
    // Point the client at the local emulators instead of the real project.
    // Set only by the end-to-end suite, through a build-time env var, so
    // there is no way for a production bundle to carry it: Vite inlines
    // the literal `false` and the branch below is dropped entirely.
    readonly useEmulators?: boolean
  },
): AppFirebaseClient {
  const appName = options?.appName ?? FIREBASE_APP_NAME
  const config = {
    apiKey: env.apiKey,
    authDomain: env.authDomain,
    projectId: env.projectId,
    appId: env.appId,
  }
  const app = getApps().some((existing) => existing.name === appName)
    ? getApp(appName)
    : initializeApp(config, appName)

  const auth = getAuth(app)
  // Auth tokens live in localStorage keyed by app name. A stable name lets
  // onAuthStateChanged restore the signed-in user after a full page reload.
  void setPersistence(auth, browserLocalPersistence)
  const db = getFirestore(app)

  if (options?.useEmulators === true) {
    // Both are idempotent per app instance, and the app name is stable, so
    // a re-render never reconnects.
    connectAuthEmulator(
      auth,
      `http://${EMULATOR_HOST}:${String(AUTH_EMULATOR_PORT)}`,
      {
        disableWarnings: true,
      },
    )
    connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT)
  }

  return { app, auth, db }
}
