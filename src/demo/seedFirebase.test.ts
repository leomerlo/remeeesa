import { describe, expect, it } from 'vitest'
import {
  PRODUCTION_PROJECT_ID,
  assertSeedableProject,
  seedFirebase,
  seedPasswordFrom,
} from './seedFirebase'

const devEnv = {
  VITE_FIREBASE_API_KEY: 'key',
  VITE_FIREBASE_AUTH_DOMAIN: 'remeeesa-dev.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'remeeesa-dev',
  VITE_FIREBASE_APP_ID: 'app',
  SEED_PASSWORD: 'secret123',
}

describe('seedFirebase', () => {
  it('refuses the production project before creating anything', async () => {
    await expect(
      seedFirebase({
        env: { ...devEnv, VITE_FIREBASE_PROJECT_ID: PRODUCTION_PROJECT_ID },
        scenario: 'completa',
      }),
    ).rejects.toThrow(/production/)
  })

  it('accepts any other project', () => {
    expect(() => {
      assertSeedableProject('remeeesa-dev')
    }).not.toThrow()
  })

  it('requires a seed password of 6+ characters', () => {
    expect(() => seedPasswordFrom({})).toThrow(/SEED_PASSWORD/)
    expect(() => seedPasswordFrom({ SEED_PASSWORD: '12345' })).toThrow(
      /SEED_PASSWORD/,
    )
    expect(seedPasswordFrom({ SEED_PASSWORD: 'secret123' })).toBe('secret123')
  })
})
