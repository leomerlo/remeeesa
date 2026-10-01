import { deleteApp, initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  updateProfile,
} from 'firebase/auth'
import { getFirestore, terminate } from 'firebase/firestore'
import { readFirebaseEnv } from '@/lib/firebase'
import { createFirestoreHouseholdsDb } from '@/lib/households/firestoreHouseholdsDb'
import { seedDemoHousehold } from './seed'
import type { DemoScenario } from './seed'

// Production's project (.firebaserc "default"). The seeder writes a whole
// household of fake data, so it refuses to touch it.
export const PRODUCTION_PROJECT_ID = 'digital-bonfire-382221'

export function assertSeedableProject(projectId: string): void {
  if (projectId === PRODUCTION_PROJECT_ID) {
    throw new Error(
      `Refusing to seed the production Firebase project (${projectId}). Point .env.preview at the preview project.`,
    )
  }
}

export function seedPasswordFrom(env: Record<string, unknown>): string {
  const password = env.SEED_PASSWORD
  if (typeof password !== 'string' || password.length < 6) {
    throw new Error('Set SEED_PASSWORD (6+ characters) in .env.preview')
  }
  return password
}

// Seeds the Firebase project in `env` with one household, owned by a brand
// new email/password user, so every run starts clean and nothing existing is
// touched. Runs through the same Firestore adapter and rules as the app.
export async function seedFirebase(input: {
  readonly env: Record<string, unknown>
  readonly scenario: DemoScenario
  readonly now?: Date
}): Promise<{ readonly email: string; readonly projectId: string }> {
  const config = readFirebaseEnv(input.env)
  assertSeedableProject(config.projectId)
  const password = seedPasswordFrom(input.env)
  const email = `seed-${(input.now ?? new Date()).getTime()}@remeeesa.test`

  const app = initializeApp(config, 'seed')
  const firestore = getFirestore(app)
  try {
    const { user } = await createUserWithEmailAndPassword(
      getAuth(app),
      email,
      password,
    )
    await updateProfile(user, { displayName: 'Seed' })
    await seedDemoHousehold({
      db: createFirestoreHouseholdsDb(firestore),
      scenario: input.scenario,
      user: { id: user.uid, displayName: 'Seed' },
    })
    return { email, projectId: config.projectId }
  } finally {
    await terminate(firestore)
    await deleteApp(app)
  }
}
