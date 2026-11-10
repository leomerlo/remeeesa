import { describe, expect, it } from 'vitest'
import { sayingAuth } from './auth'

// Firebase says "auth/invalid-credential". A person needs to be told what
// to do about it, and never a code: a code on screen only tells somebody
// that they cannot fix this themselves.
describe('what a failed sign-in says out loud', () => {
  it('says what to do about the ones that happen', () => {
    expect(sayingAuth({ code: 'auth/invalid-credential' })).toBe(
      'El correo o la contraseña no coinciden.',
    )
    expect(sayingAuth({ code: 'auth/email-already-in-use' })).toContain(
      'Entrá con tu contraseña',
    )
    expect(sayingAuth({ code: 'auth/weak-password' })).toContain('6 letras')
  })

  it('never shows a code, whatever went wrong', () => {
    for (const error of [
      { code: 'auth/some-code-nobody-mapped' },
      new Error('boom'),
      null,
      undefined,
      'a string',
    ]) {
      const said = sayingAuth(error)
      expect(said).not.toContain('auth/')
      expect(said.length).toBeGreaterThan(0)
    }
  })
})
