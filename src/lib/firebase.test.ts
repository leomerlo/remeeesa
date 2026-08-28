import { deleteApp } from 'firebase/app'
import { describe, expect, it } from 'vitest'
import {
  createFirebaseClient,
  FIREBASE_APP_NAME,
  readFirebaseEnv,
} from './firebase'

const complete = {
  VITE_FIREBASE_API_KEY: 'test-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'remeeesa.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'remeeesa',
  VITE_FIREBASE_APP_ID: '1:123:web:abc',
}

describe('readFirebaseEnv', () => {
  it('returns all values when the source is complete', () => {
    expect(readFirebaseEnv(complete)).toEqual({
      apiKey: 'test-api-key',
      authDomain: 'remeeesa.firebaseapp.com',
      projectId: 'remeeesa',
      appId: '1:123:web:abc',
    })
  })

  it('trims surrounding whitespace from the values', () => {
    expect(
      readFirebaseEnv({
        VITE_FIREBASE_API_KEY: '  test-api-key\n',
        VITE_FIREBASE_AUTH_DOMAIN: ' remeeesa.firebaseapp.com ',
        VITE_FIREBASE_PROJECT_ID: 'remeeesa',
        VITE_FIREBASE_APP_ID: '1:123:web:abc',
      }),
    ).toEqual({
      apiKey: 'test-api-key',
      authDomain: 'remeeesa.firebaseapp.com',
      projectId: 'remeeesa',
      appId: '1:123:web:abc',
    })
  })

  it('throws naming a missing key', () => {
    expect(() =>
      readFirebaseEnv({
        VITE_FIREBASE_AUTH_DOMAIN: complete.VITE_FIREBASE_AUTH_DOMAIN,
        VITE_FIREBASE_PROJECT_ID: complete.VITE_FIREBASE_PROJECT_ID,
        VITE_FIREBASE_APP_ID: complete.VITE_FIREBASE_APP_ID,
      }),
    ).toThrow('VITE_FIREBASE_API_KEY')
  })

  it('throws naming an empty key', () => {
    expect(() =>
      readFirebaseEnv({ ...complete, VITE_FIREBASE_PROJECT_ID: '' }),
    ).toThrow('VITE_FIREBASE_PROJECT_ID')
  })

  it('throws naming a whitespace-only key', () => {
    expect(() =>
      readFirebaseEnv({ ...complete, VITE_FIREBASE_APP_ID: '   ' }),
    ).toThrow('VITE_FIREBASE_APP_ID')
  })

  it('names every invalid key at once', () => {
    expect(() => readFirebaseEnv({})).toThrow(
      'VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID',
    )
  })
})

describe('createFirebaseClient', () => {
  it('builds a client from placeholder credentials without any network call', async () => {
    const client = createFirebaseClient(
      {
        apiKey: 'test-api-key',
        authDomain: 'remeeesa.firebaseapp.com',
        projectId: 'remeeesa',
        appId: '1:123:web:abc',
      },
      { appName: `test-${crypto.randomUUID()}` },
    )

    expect(client.auth.app).toBe(client.app)
    expect(client.db.app).toBe(client.app)

    await deleteApp(client.app)
  })

  it('uses a stable default app name so auth can restore after reload', async () => {
    const env = {
      apiKey: 'test-api-key',
      authDomain: 'remeeesa.firebaseapp.com',
      projectId: 'remeeesa',
      appId: '1:123:web:abc',
    }

    const first = createFirebaseClient(env)
    const second = createFirebaseClient(env)

    expect(first.app.name).toBe(FIREBASE_APP_NAME)
    expect(second.app).toBe(first.app)

    await deleteApp(first.app)
  })
})
